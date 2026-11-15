import SwiftUI

/// Réglages, présentés en feuille depuis la barre d'outils.
struct SettingsView: View {
    @ObservedObject var settings: AppSettings
    let serviceName: String
    let onReload: () -> Void
    let onSignOut: () -> Void
    let onClose: () -> Void

    @State private var confirmingSignOut = false

    private var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Ouvrir les contenus reçus", isOn: $settings.allowShared)
                } footer: {
                    Text("Activé : une publication, un reel ou une story reçus dans une conversation peuvent s’ouvrir, sans aller plus loin. Désactivé : seules les conversations s’affichent.")
                }

                Section {
                    Toggle("Masquer les menus du site", isOn: $settings.cosmetics)
                } footer: {
                    Text("Cache les boutons qui mènent au fil, à la recherche et aux reels. À désactiver si un élément utile de la messagerie a disparu. Les pages hors messagerie restent bloquées dans les deux cas.")
                }

                Section {
                    Button("Recharger la messagerie") {
                        onReload()
                    }
                    Button("Se déconnecter", role: .destructive) {
                        confirmingSignOut = true
                    }
                }

                Section {
                    LabeledContent("Réseau", value: serviceName)
                    LabeledContent("Version", value: version)
                } footer: {
                    Text("JusteDM affiche le site du réseau, limité à sa messagerie. Vos identifiants ne quittent pas cet iPhone : ils sont saisis sur la page de connexion du réseau.")
                }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        onClose()
                    }
                }
            }
            .confirmationDialog(
                "Se déconnecter ?",
                isPresented: $confirmingSignOut,
                titleVisibility: .visible
            ) {
                Button("Se déconnecter", role: .destructive) {
                    onSignOut()
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Les cookies et les données du site enregistrés dans l’app seront effacés.")
            }
        }
    }
}
