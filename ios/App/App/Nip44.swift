import CryptoKit
import CryptoSwift
import Foundation
import P256K

enum Nip44 {
    static func decrypt(nsec: String, payload: String) throws -> String {
        let secret = try decodeNsec(nsec)
        let privateKey = try P256K.Signing.PrivateKey(dataRepresentation: secret)
        let publicKey = privateKey.publicKey.dataRepresentation
        guard publicKey.count == 33 else { throw Error.invalidKey }
        let conversationKey = hmac(
            key: Data("nip44-v2".utf8),
            data: Data(publicKey.dropFirst()),
        )
        guard let decoded = Data(base64Encoded: payload), decoded.count >= 99, decoded[0] == 2 else {
            throw Error.invalidPayload
        }
        let nonce = decoded[1 ..< 33]
        let ciphertext = decoded[33 ..< decoded.count - 32]
        let mac = decoded.suffix(32)
        let keys = hkdfExpand(key: conversationKey, info: Data(nonce), length: 76)
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

    private static func hkdfExpand(key: Data, info: Data, length: Int) -> Data {
        var output = Data(); var previous = Data(); var counter: UInt8 = 1
        while output.count < length {
            previous = hmac(key: key, data: previous + info + Data([counter]))
            output.append(previous); counter += 1
        }
        return output.prefix(length)
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
