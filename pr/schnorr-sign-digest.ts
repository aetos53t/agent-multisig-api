/**
 * ADD THIS TO: src/tools/signing.tools.ts
 * 
 * Insert this tool registration inside the registerSigningTools() function,
 * alongside the existing sip018_sign, btc_sign_message, etc.
 */

// Add to imports at top of file:
// import { schnorr } from "@noble/curves/secp256k1";
// import { deriveTaprootKeyPair } from "../utils/bitcoin.js";

// Add this tool registration inside registerSigningTools():

server.registerTool(
  "schnorr_sign_digest",
  {
    description:
      "Sign a raw 32-byte digest with Schnorr using the wallet's Taproot private key. " +
      "Use for Taproot script-path spending, multisig coordination, or any case where " +
      "you need a BIP340 Schnorr signature over a pre-computed hash (e.g., BIP341 sighash). " +
      "Returns a 64-byte signature and the x-only public key.",
    inputSchema: {
      digest: z
        .string()
        .length(64)
        .regex(/^[0-9a-fA-F]+$/)
        .describe(
          "32-byte hex-encoded digest to sign (e.g., BIP341 transaction sighash)"
        ),
      auxRand: z
        .string()
        .length(64)
        .regex(/^[0-9a-fA-F]+$/)
        .optional()
        .describe(
          "Optional 32-byte hex auxiliary randomness for BIP340 (improves side-channel resistance)"
        ),
    },
  },
  async ({ digest, auxRand }) => {
    try {
      // Get wallet session
      const walletManager = getWalletManager();
      const sessionInfo = walletManager.getSessionInfo();

      if (!sessionInfo?.mnemonic) {
        throw new Error(
          "Wallet not unlocked. Use unlock_wallet first to access signing capabilities."
        );
      }

      // Derive Taproot keypair
      const { privateKey, publicKey } = deriveTaprootKeyPair(
        sessionInfo.mnemonic,
        NETWORK
      );

      // Validate and decode digest
      const digestBytes = hex.decode(digest);
      if (digestBytes.length !== 32) {
        throw new Error("Digest must be exactly 32 bytes");
      }

      // Optional aux randomness for BIP340
      const auxBytes = auxRand ? hex.decode(auxRand) : undefined;

      // Sign with Schnorr (BIP340)
      const signature = schnorr.sign(digestBytes, privateKey, auxBytes);

      // Get x-only public key (32 bytes, no prefix)
      const xOnlyPubkey = schnorr.getPublicKey(privateKey);

      return createJsonResponse({
        signature: hex.encode(signature),
        publicKey: hex.encode(xOnlyPubkey),
        address: sessionInfo.taprootAddress,
        network: NETWORK,
        note: "64-byte BIP340 Schnorr signature. For Taproot script-path spending, append sighash type byte if not SIGHASH_DEFAULT.",
      });
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);
