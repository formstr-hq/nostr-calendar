import Capacitor

final class MainViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(KeyBackupPlugin())
        bridge?.registerPluginInstance(NotificationSchedulerPlugin())
        bridge?.registerPluginInstance(DeviceCalendarPlugin())
    }
}
