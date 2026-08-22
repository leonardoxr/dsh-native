import SwiftUI

@main
struct DSHNativeApp: App {
    @StateObject private var store = ServerStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView(store: store)

                if scenePhase != .active {
                    PrivacyCoverView()
                        .transition(.identity)
                        .zIndex(100)
                }
            }
            .tint(Color("AccentColor"))
        }
    }
}

private struct PrivacyCoverView: View {
    var body: some View {
        ZStack {
            Color("LaunchBackground")
                .ignoresSafeArea()

            VStack(spacing: 14) {
                Image("LaunchMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 92, height: 92)
                    .accessibilityHidden(true)

                Text("DSH Native")
                    .font(.headline)
                    .foregroundStyle(.white)
            }
        }
        .accessibilityHidden(true)
    }
}
