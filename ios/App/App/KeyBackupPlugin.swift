import Capacitor
import UIKit

/** Exports text files through iOS's Files document picker. */
@objc(KeyBackupPlugin)
public class KeyBackupPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeyBackupPlugin"
    public let jsName = "KeyBackup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise)
    ]

    @objc func saveFile(_ call: CAPPluginCall) {
        guard let text = call.getString("text"),
              let fileName = call.getString("fileName"),
              let mimeType = call.getString("mimeType") else {
            call.reject("text, fileName, and mimeType are required")
            return
        }

        let safeFileName = fileName.replacingOccurrences(of: "/", with: "_")
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(safeFileName)
        do {
            guard let data = text.data(using: .utf8) else {
                call.reject("Could not encode file")
                return
            }
            try data.write(to: fileURL, options: .atomic)
        } catch {
            call.reject("Could not create file", nil, error)
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let viewController = self?.bridge?.viewController else {
                call.reject("Could not present file exporter")
                return
            }

            let controller = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
            controller.modalPresentationStyle = .formSheet
            viewController.present(controller, animated: true)
            call.resolve(["uri": fileURL.absoluteString, "mimeType": mimeType])
        }
    }
}
