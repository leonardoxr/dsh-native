import SwiftUI

struct ServerEditorView: View {
    let server: SavedServer?
    let store: ServerStore

    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?
    @State private var draft: ServerDraft
    @State private var errorMessage: String?

    private enum Field {
        case name
        case url
    }

    init(server: SavedServer?, store: ServerStore) {
        self.server = server
        self.store = store
        _draft = State(initialValue: server.map(ServerDraft.init) ?? ServerDraft())
    }

    private var normalizedURL: URL? {
        try? ServerURLPolicy.normalize(draft.urlText)
    }

    private var canSave: Bool {
        !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && normalizedURL != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("My Harness", text: $draft.name)
                        .textContentType(.organizationName)
                        .focused($focusedField, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .url }

                    TextField("https://host.example.com", text: $draft.urlText)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .url)
                        .submitLabel(.done)
                        .onSubmit(saveIfPossible)
                } header: {
                    Text("Server")
                } footer: {
                    Text("Only trusted HTTPS servers can be opened. Credentials belong in the server’s sign-in page.")
                }

                if !draft.urlText.isEmpty {
                    Section("Preview") {
                        if let normalizedURL {
                            Label(normalizedURL.absoluteString, systemImage: "lock.shield.fill")
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                        } else {
                            Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
            .navigationTitle(server == nil ? "Add Server" : "Edit Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
            }
            .alert("Couldn’t Save Server", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Please try again.")
            }
            .onAppear {
                focusedField = server == nil ? .name : nil
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var validationMessage: String {
        do {
            _ = try ServerURLPolicy.normalize(draft.urlText)
            return "Secure HTTPS server"
        } catch {
            return error.localizedDescription
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    private func saveIfPossible() {
        guard canSave else { return }
        save()
    }

    private func save() {
        do {
            try store.upsert(draft, id: server?.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
