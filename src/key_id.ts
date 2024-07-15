import { promises as fs } from "fs";
import type { KeyIdStorage, MethodDigest } from "@iota/identity-wasm/node";

export class KeyIdFileStore implements KeyIdStorage {
  private readonly filePath: string;

  constructor(filePath = "./key_ids.json") {
    this.filePath = filePath;
  }

  private async readKeyIdsFromFile(): Promise<Map<string, string>> {
    try {
      const fileContent = await fs.readFile(this.filePath, "utf-8");
      const parsedData = JSON.parse(fileContent);
      return new Map(Object.entries(parsedData));
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        // File doesn't exist yet, start with an empty map
        return new Map<string, string>();
      } else {
        throw err; // Re-throw unexpected errors
      }
    }
  }

  private async writeKeyIdsToFile(keyIds: Map<string, string>): Promise<void> {
    const dataToSave = Object.fromEntries(keyIds);
    const jsonContent = JSON.stringify(dataToSave, null, 2); // Pretty-print for readability
    await fs.writeFile(this.filePath, jsonContent, "utf-8");
  }

  public async insertKeyId(
    methodDigest: MethodDigest,
    keyId: string
  ): Promise<void> {
    const keyIds = await this.readKeyIdsFromFile();
    const methodDigestAsString = methodDigestToString(methodDigest);

    if (keyIds.has(methodDigestAsString)) {
      throw new Error("KeyId already exists");
    }

    keyIds.set(methodDigestAsString, keyId);
    await this.writeKeyIdsToFile(keyIds);
  }

  public async getKeyId(methodDigest: MethodDigest): Promise<string> {
    const keyIds = await this.readKeyIdsFromFile();
    const methodDigestAsString = methodDigestToString(methodDigest);
    const value = keyIds.get(methodDigestAsString);

    if (!value) {
      throw new Error("KeyId not found");
    }
    return value;
  }

  public async deleteKeyId(methodDigest: MethodDigest): Promise<void> {
    const keyIds = await this.readKeyIdsFromFile();
    const methodDigestAsString = methodDigestToString(methodDigest);

    if (!keyIds.delete(methodDigestAsString)) {
      throw new Error("KeyId not found!");
    }
    await this.writeKeyIdsToFile(keyIds);
  }

  public async count(): Promise<number> {
    const keyIds = await this.readKeyIdsFromFile();
    return keyIds.size;
  }
}

/**
 * Converts a `MethodDigest` to a base64 encoded string.
 */
function methodDigestToString(methodDigest: MethodDigest): string {
  let arrayBuffer = methodDigest.pack().buffer;
  let buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}
