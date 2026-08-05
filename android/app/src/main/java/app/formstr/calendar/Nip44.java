package app.formstr.calendar;

import org.bouncycastle.asn1.sec.SECNamedCurves;
import org.bouncycastle.asn1.x9.X9ECParameters;
import org.bouncycastle.crypto.agreement.ECDHBasicAgreement;
import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.engines.ChaCha7539Engine;
import org.bouncycastle.crypto.generators.HKDFBytesGenerator;
import org.bouncycastle.crypto.macs.HMac;
import org.bouncycastle.crypto.params.ECDomainParameters;
import org.bouncycastle.crypto.params.ECPrivateKeyParameters;
import org.bouncycastle.crypto.params.ECPublicKeyParameters;
import org.bouncycastle.crypto.params.HKDFParameters;
import org.bouncycastle.crypto.params.KeyParameter;
import org.bouncycastle.crypto.params.ParametersWithIV;
import org.bouncycastle.math.ec.ECPoint;
import org.bouncycastle.util.BigIntegers;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

/** NIP-44 v2 decryption for self-encrypted calendar event payloads. */
final class Nip44 {
    private static final X9ECParameters CURVE = SECNamedCurves.getByName("secp256k1");

    private Nip44() {}

    static String decrypt(String nsec, String payload) throws Exception {
        byte[] secret = decodeNsec(nsec);
        BigInteger scalar = new BigInteger(1, secret);
        if (secret.length != 32 || scalar.signum() <= 0 || scalar.compareTo(CURVE.getN()) >= 0) {
            throw new IllegalArgumentException("Invalid nsec view key");
        }

        // Self-encryption idiom (see nostr-calendar's selfEncrypt/selfDecrypt):
        // the "other party" in the ECDH is this same key's own public point,
        // so the shared secret is scalar * (scalar * G). Delegating the
        // agreement itself to BouncyCastle's ECDHBasicAgreement rather than
        // hand-multiplying points avoids re-deriving just the public key
        // (scalar * G) and mistaking that for the shared secret.
        ECDomainParameters domainParameters =
                new ECDomainParameters(CURVE.getCurve(), CURVE.getG(), CURVE.getN(), CURVE.getH());
        ECPrivateKeyParameters privateKey = new ECPrivateKeyParameters(scalar, domainParameters);
        ECPoint publicPoint = domainParameters.getG().multiply(scalar).normalize();
        ECPublicKeyParameters publicKey = new ECPublicKeyParameters(publicPoint, domainParameters);
        ECDHBasicAgreement agreement = new ECDHBasicAgreement();
        agreement.init(privateKey);
        byte[] sharedX = BigIntegers.asUnsignedByteArray(32, agreement.calculateAgreement(publicKey));

        byte[] conversationKey = hmac("nip44-v2".getBytes(StandardCharsets.UTF_8), sharedX);
        byte[] decoded = Base64.getDecoder().decode(payload);
        if (decoded.length < 99 || decoded[0] != 2) throw new IllegalArgumentException("Unsupported NIP-44 payload");
        byte[] nonce = Arrays.copyOfRange(decoded, 1, 33);
        byte[] ciphertext = Arrays.copyOfRange(decoded, 33, decoded.length - 32);
        byte[] mac = Arrays.copyOfRange(decoded, decoded.length - 32, decoded.length);

        HKDFBytesGenerator hkdf = new HKDFBytesGenerator(new SHA256Digest());
        hkdf.init(HKDFParameters.skipExtractParameters(conversationKey, nonce));
        byte[] keys = new byte[76];
        hkdf.generateBytes(keys, 0, 76);

        byte[] aad = new byte[nonce.length + ciphertext.length];
        System.arraycopy(nonce, 0, aad, 0, nonce.length);
        System.arraycopy(ciphertext, 0, aad, nonce.length, ciphertext.length);
        if (!MessageDigest.isEqual(mac, hmac(Arrays.copyOfRange(keys, 44, 76), aad))) {
            throw new IllegalArgumentException("Invalid NIP-44 MAC");
        }
        ChaCha7539Engine cipher = new ChaCha7539Engine();
        cipher.init(false, new ParametersWithIV(new KeyParameter(Arrays.copyOfRange(keys, 0, 32)), Arrays.copyOfRange(keys, 32, 44)));
        byte[] padded = new byte[ciphertext.length];
        cipher.processBytes(ciphertext, 0, ciphertext.length, padded, 0);
        int length = readU16(padded, 0);
        int offset = 2;
        if (length == 0) { length = readU32(padded, 2); offset = 6; }
        if (length <= 0 || offset + length > padded.length) throw new IllegalArgumentException("Invalid NIP-44 padding");
        return new String(padded, offset, length, StandardCharsets.UTF_8);
    }

    private static byte[] hmac(byte[] key, byte[] data) {
        HMac mac = new HMac(new SHA256Digest()); mac.init(new KeyParameter(key)); mac.update(data, 0, data.length);
        byte[] output = new byte[mac.getMacSize()]; mac.doFinal(output, 0); return output;
    }
    private static byte[] decodeNsec(String nsec) {
        final String charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
        int separator = nsec.lastIndexOf('1');
        if (separator < 1 || !"nsec".equalsIgnoreCase(nsec.substring(0, separator))) throw new IllegalArgumentException("Expected nsec");
        String data = nsec.substring(separator + 1).toLowerCase(); if (data.length() < 7) throw new IllegalArgumentException("Invalid bech32");
        int accumulator = 0, bits = 0; List<Byte> output = new ArrayList<>();
        for (int index = 0; index < data.length() - 6; index++) {
            int value = charset.indexOf(data.charAt(index)); if (value < 0) throw new IllegalArgumentException("Invalid bech32");
            accumulator = (accumulator << 5) | value; bits += 5;
            while (bits >= 8) { bits -= 8; output.add((byte) ((accumulator >> bits) & 255)); }
        }
        byte[] bytes = new byte[output.size()]; for (int index = 0; index < bytes.length; index++) bytes[index] = output.get(index); return bytes;
    }
    private static int readU16(byte[] bytes, int offset) { return ((bytes[offset] & 255) << 8) | (bytes[offset + 1] & 255); }
    private static int readU32(byte[] bytes, int offset) { return ((bytes[offset] & 255) << 24) | ((bytes[offset + 1] & 255) << 16) | ((bytes[offset + 2] & 255) << 8) | (bytes[offset + 3] & 255); }
}
