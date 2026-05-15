import {
  generateKeyPairSync,
  KeyObject,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
} from "crypto";
import * as fs from "fs";

type JwtPayload = Record<string, any>;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function parseDurationSeconds(expiresInSeconds: number): number {
  return Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? Math.floor(expiresInSeconds)
    : 0;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return Buffer.compare(aBuf, bBuf) === 0;
}
class JwtHelper {
  private static _instance: JwtHelper;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private static readonly privateKeyPath = "./data/jwt/private.key";
  private static readonly publicKeyPath = "./data/jwt/public.key";

  constructor() {
    if (
      fs.existsSync(JwtHelper.privateKeyPath) &&
      fs.existsSync(JwtHelper.publicKeyPath)
    ) {
      this.privateKey = createPrivateKey(
        fs.readFileSync(JwtHelper.privateKeyPath),
      );
      this.publicKey = createPublicKey(
        fs.readFileSync(JwtHelper.publicKeyPath),
      );
    } else {
      const { privateKey, publicKey } = this.generateKeys();
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      fs.mkdirSync("./data/jwt", { recursive: true });
      fs.writeFileSync(
        JwtHelper.privateKeyPath,
        privateKey.export({ type: "pkcs8", format: "pem" }),
      );
      fs.writeFileSync(
        JwtHelper.publicKeyPath,
        publicKey.export({ type: "spki", format: "pem" }),
      );
    }
  }
  public issueToken(payload: object, expiresInSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + parseDurationSeconds(expiresInSeconds);
    const header = { alg: "RS256", typ: "JWT" };
    const claims: JwtPayload = {
      ...payload,
      iss: "skibot",
      iat: now,
      exp,
    };
    const headerPart = base64UrlEncode(JSON.stringify(header));
    const payloadPart = base64UrlEncode(JSON.stringify(claims));
    const signingInput = `${headerPart}.${payloadPart}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(this.privateKey);
    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  public verifyToken(token: string | undefined): object | null {
    try {
      if (!token) return null;

      const parts = token.split(".");
      if (parts.length !== 3) return null;

      const [headerPart, payloadPart, signaturePart] = parts;
      const header = JSON.parse(base64UrlDecode(headerPart).toString("utf8"));
      if (header?.alg !== "RS256") return null;

      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${headerPart}.${payloadPart}`);
      verifier.end();
      const signature = base64UrlDecode(signaturePart);
      if (!verifier.verify(this.publicKey, signature)) return null;

      const payload = JSON.parse(
        base64UrlDecode(payloadPart).toString("utf8"),
      ) as JwtPayload;
      if (
        typeof payload.exp === "number" &&
        payload.exp < Math.floor(Date.now() / 1000)
      ) {
        return null;
      }
      if (payload.iss !== "skibot") return null;
      return payload;
    } catch (error) {
      console.error("JWT verification error:", (error as Error).message);
      return null;
    }
  }

  private generateKeys(): { privateKey: KeyObject; publicKey: KeyObject } {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    return { privateKey, publicKey };
  }
}

const jwtHelper = new JwtHelper();

export default jwtHelper;
