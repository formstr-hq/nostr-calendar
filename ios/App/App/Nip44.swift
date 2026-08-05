import CryptoKit
import CryptoSwift
import Foundation
import P256K

enum Nip44 {
    static func decrypt(nsec: String, payload: String) throws -> String {
        let secret = try decodeNsec(nsec)

        // Self-encryption idiom (see nostr-calendar's selfEncrypt/selfDecrypt on the
        // JS side): the "other party" in the ECDH is this same key's own public
        // point. Delegating to P256K.KeyAgreement's sharedSecretFromKeyAgreement
        // (secp256k1_ecdh) rather than hashing the public key directly avoids
        // mistaking the public key itself for the ECDH shared secret.
        let privateKey = try P256K.KeyAgreement.PrivateKey(dataRepresentation: secret)
        let sharedSecret = privateKey.sharedSecretFromKeyAgreement(with: privateKey.publicKey)
        // Compressed shared point is [0x02/0x03 prefix][32-byte X]; NIP-44 only
        // wants the X coordinate, matching nostr-tools' getSharedSecret(...).subarray(1, 33).
        let sharedX = sharedSecret.withUnsafeBytes { Data($0).dropFirst() }

        guard let decoded = Data(base64Encoded: payload), decoded.count >= 99, decoded[0] == 2 else {
            throw Error.invalidPayload
        }
        let nonce = decoded[1 ..< 33]
        let ciphertext = decoded[33 ..< decoded.count - 32]
        let mac = decoded.suffix(32)

        // conversation_key = hkdf_extract(salt="nip44-v2", ikm=sharedX)
        // keys            = hkdf_expand(prk=conversation_key, info=nonce, length=76)
        // CryptoSwift's HKDF performs both RFC 5869 steps in one call.
        let keys = try HKDF(
            password: Array(sharedX),
            salt: Array("nip44-v2".utf8),
            info: Array(nonce),
            keyLength: 76,
            variant: .sha2(.sha256)
        ).calculate()

        let calculatedMac = hmac(key: Data(keys[44 ..< 76]), data: Data(nonce) + Data(ciphertext))
        guard calculatedMac == Data(mac) else { throw Error.invalidMac }
        let cipher = try ChaCha20(key: Array(keys[0 ..< 32]), iv: Array(keys[32 ..< 44]))
        let padded = try cipher.decrypt(Array(ciphertext))
        let length = Int(padded[0]) << 8 | Int(padded[1])
        let prefixLength = length == 0 ? 6 : 2
        let plaintextLength = length == 0
            ? Int(padded[2]) << 24 | Int(padded[3]) << 16 | Int(padded[4]) << 8 | Int(padded[5])
            : length
        guard plaintextLength > 0, prefixLength + plaintextLength <= padded.count else { throw Error.invalidPadding }
        return String(decoding: padded[prefixLength ..< prefixLength + plaintextLength], as: UTF8.self)
    }

    private static func hmac(key: Data, data: Data) -> Data {
        Data(CryptoKit.HMAC<CryptoKit.SHA256>.authenticationCode(for: data, using: CryptoKit.SymmetricKey(data: key)))
    }

    private static func decodeNsec(_ value: String) throws -> Data {
        let charset = Array("qpzry9x8gf2tvdw0s3jn54khce6mua7l")
        guard let separator = value.lastIndex(of: "1"), value[..<separator].lowercased() == "nsec" else { throw Error.invalidKey }
        let payload = value[value.index(after: separator)...].lowercased()
        guard payload.count >= 7 else { throw Error.invalidKey }
        var output = Data(); var accumulator = 0; var bits = 0
        for character in payload.dropLast(6) {
            guard let index = charset.firstIndex(of: character) else { throw Error.invalidKey }
            accumulator = accumulator << 5 | index; bits += 5
            while bits >= 8 { bits -= 8; output.append(UInt8(accumulator >> bits & 255)) }
        }
        guard output.count == 32 else { throw Error.invalidKey }
        return output
    }

    enum Error: Swift.Error { case invalidKey, invalidPayload, invalidMac, invalidPadding }
}
