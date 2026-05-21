// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.0.0"),
        .package(name: "CapacitorApp", path: "../../../node_modules/.pnpm/@capacitor+app@8.0.1_@capacitor+core@8.0.0/node_modules/@capacitor/app"),
        .package(name: "CapacitorLocalNotifications", path: "../../../node_modules/.pnpm/@capacitor+local-notifications@8.0.1_@capacitor+core@8.0.0/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPreferences", path: "../../../node_modules/.pnpm/@capacitor+preferences@8.0.0_@capacitor+core@8.0.0/node_modules/@capacitor/preferences"),
        .package(name: "KhadarvskCapacitorSecureStorage", path: "../../../node_modules/.pnpm/@khadarvsk+capacitor-secure-storage@0.0.2_patch_hash=f65e5bd94568ebe73d4de50ef5e835902c_27f60116bb409beae1c74b9c3ae75b97/node_modules/@khadarvsk/capacitor-secure-storage"),
        .package(name: "NostrSignerCapacitorPlugin", path: "../../../node_modules/.pnpm/nostr-signer-capacitor-plugin@0.0.5_patch_hash=02913e3c2941eee20a2c373e6f312de15f140907_c1f40da3e83cc0119c83ae057b4f451e/node_modules/nostr-signer-capacitor-plugin")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "KhadarvskCapacitorSecureStorage", package: "KhadarvskCapacitorSecureStorage"),
                .product(name: "NostrSignerCapacitorPlugin", package: "NostrSignerCapacitorPlugin")
            ]
        )
    ]
)
