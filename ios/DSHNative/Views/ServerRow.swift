import SwiftUI

struct ServerRow: View {
    let server: SavedServer

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color("AccentColor"), Color.purple.opacity(0.85)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 46, height: 46)

                Image(systemName: "terminal.fill")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(server.name)
                    .font(.headline)
                    .lineLimit(1)

                Label(server.displayHost, systemImage: "lock.fill")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if let lastUsedAt = server.lastUsedAt {
                Text(lastUsedAt, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(server.name), secure server \(server.displayHost)")
        .accessibilityHint("Opens this server")
    }
}
