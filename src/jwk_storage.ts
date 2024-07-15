import * as ed from "@noble/ed25519";
import { promises as fs } from "fs";
import {
  decodeB64,
  encodeB64,
  Jwk,
  JwkGenOutput,
  JwkStorage,
  EdCurve,
  JwkType,
  JwsAlgorithm,
  IJwkParams,
} from "@iota/identity-wasm/node";

type Ed25519PrivateKey = Uint8Array;
type Ed25519PublicKey = Uint8Array;

export class JwkMemStore implements JwkStorage {
  /** The map from key identifiers to Jwks. */
  private readonly filePath: string;

  constructor(filePath = "./jwks.json") {
    this.filePath = filePath;
  }

  public static ed25519KeyType(): string {
    return "Ed25519";
  }

  private async readJwksFromFile(): Promise<Map<string, Jwk>> {
    try {
      const fileContent = await fs.readFile(this.filePath, "utf-8");
      const parsedData = JSON.parse(fileContent);
      // Convert parsed objects back to Jwk instances
      const jwksMap = new Map<string, Jwk>();
      for (const [keyId, jwkData] of Object.entries(parsedData)) {
        jwksMap.set(keyId, new Jwk(jwkData as IJwkParams));
      }
      return jwksMap;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        // File doesn't exist yet, start with an empty map
        return new Map<string, Jwk>();
      } else {
        throw err; // Re-throw unexpected errors
      }
    }
  }

  private async writeJwksToFile(jwks: Map<string, Jwk>): Promise<void> {
    const dataToSave = Object.fromEntries(jwks);
    const jsonContent = JSON.stringify(dataToSave, null, 2); // Pretty-print for readability
    await fs.writeFile(this.filePath, jsonContent, "utf-8");
  }

  public async generate(
    keyType: string,
    algorithm: JwsAlgorithm
  ): Promise<JwkGenOutput> {
    if (keyType !== JwkMemStore.ed25519KeyType()) {
      throw new Error(`unsupported key type ${keyType}`);
    }

    if (algorithm !== JwsAlgorithm.EdDSA) {
      throw new Error(`unsupported algorithm`);
    }

    const keyId = randomKeyId();
    const privKey: Ed25519PrivateKey = ed.utils.randomPrivateKey();
    const jwk = await encodeJwk(privKey, algorithm);

    const jwks = await this.readJwksFromFile();
    jwks.set(keyId, jwk);
    await this.writeJwksToFile(jwks);

    const publicJWK = jwk.toPublic();
    if (!publicJWK) {
      throw new Error(`JWK is not a public key`);
    }

    return new JwkGenOutput(keyId, publicJWK);
  }

  public async sign(
    keyId: string,
    data: Uint8Array,
    publicKey: Jwk
  ): Promise<Uint8Array> {
    if (publicKey.alg() !== JwsAlgorithm.EdDSA) {
      throw new Error("unsupported JWS algorithm");
    } else {
      if (publicKey.paramsOkp()?.crv !== (EdCurve.Ed25519 as string)) {
        throw new Error("unsupported Okp parameter");
      }
    }

    const jwks = await this.readJwksFromFile();
    const jwk = jwks.get(keyId);

    if (jwk) {
      const [privateKey, _] = decodeJwk(jwk);
      return ed.sign(data, privateKey);
    } else {
      throw new Error(`key with id ${keyId} not found`);
    }
  }

  public async insert(jwk: Jwk): Promise<string> {
    const keyId = randomKeyId();

    if (!jwk.isPrivate) {
      throw new Error("expected a JWK with all private key components set");
    }

    if (!jwk.alg()) {
      throw new Error("expected a Jwk with an `alg` parameter");
    }

    const jwks = await this.readJwksFromFile();
    jwks.set(keyId, jwk);
    await this.writeJwksToFile(jwks);

    return keyId;
  }

  public async delete(keyId: string): Promise<void> {
    const jwks = await this.readJwksFromFile();
    if (!jwks.delete(keyId)) {
      throw new Error(`key with id ${keyId} not found`);
    }
    await this.writeJwksToFile(jwks);
  }

  public async exists(keyId: string): Promise<boolean> {
    const jwks = await this.readJwksFromFile();
    return jwks.has(keyId);
  }

  public async count(): Promise<number> {
    const jwks = await this.readJwksFromFile();
    return jwks.size;
  }
}

// Encodes a Ed25519 keypair into a Jwk.
async function encodeJwk(
  privateKey: Ed25519PrivateKey,
  alg: JwsAlgorithm
): Promise<Jwk> {
  const publicKey = await ed.getPublicKey(privateKey);
  let x = encodeB64(publicKey);
  let d = encodeB64(privateKey);

  return new Jwk({
    kty: JwkType.Okp,
    crv: "Ed25519",
    d,
    x,
    alg,
  });
}

function decodeJwk(jwk: Jwk): [Ed25519PrivateKey, Ed25519PublicKey] {
  if (jwk.alg() !== JwsAlgorithm.EdDSA) {
    throw new Error("unsupported `alg`");
  }

  const paramsOkp = jwk.paramsOkp();
  if (paramsOkp) {
    const d = paramsOkp.d;

    if (d) {
      let textEncoder = new TextEncoder();
      const privateKey = decodeB64(textEncoder.encode(d));
      const publicKey = decodeB64(textEncoder.encode(paramsOkp.x));
      return [privateKey, publicKey];
    } else {
      throw new Error("missing private key component");
    }
  } else {
    throw new Error("expected Okp params");
  }
}

// Returns a random number between `min` and `max` (inclusive).
// SAFETY NOTE: This is not cryptographically secure randomness and thus not suitable for production use.
// It suffices for our testing implementation however and avoids an external dependency.
function getRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns a random key id.
function randomKeyId(): string {
  const randomness = new Uint8Array(20);
  for (let index = 0; index < randomness.length; index++) {
    randomness[index] = getRandomNumber(0, 255);
  }

  return encodeB64(randomness);
}
