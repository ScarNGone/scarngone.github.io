# JusteDM

Une app iPhone qui ouvre la messagerie d'Instagram et bloque le reste du site : fil, reels, recherche, profils. On y lit ses messages et on y répond, rien de plus.

L'app est prévue pour accueillir d'autres réseaux plus tard. Pour l'instant, seul Instagram est décrit.

## Ce que fait l'app

Au lancement, JusteDM affiche la boîte de réception d'Instagram. La première fois, c'est la page de connexion d'Instagram qui apparaît : on s'y connecte comme dans Safari.

| Page | Sort |
| --- | --- |
| Conversations, demandes de message, nouveau message | Affichée |
| Connexion, double authentification, vérifications de sécurité | Affichée |
| Publication, reel ou story reçus dans une conversation | Affichée, une seule à la fois (réglage) |
| Fil, recherche, reels, profils, notifications d'activité | Bloquée |
| Renvois vers l'App Store ou vers Threads | Bloqués |
| Lien externe reçu dans un message | Ouvert dans Safari |

Quand un contenu reçu est ouvert, impossible d'enchaîner : le reel suivant, une autre publication ou le profil de l'auteur restent bloqués. Un réglage coupe aussi cette ouverture, pour ne garder que les conversations.

Le mot de passe est saisi sur la page de connexion d'Instagram. L'app ne le lit pas et n'envoie rien à un serveur tiers. La session est gardée sur l'iPhone, dans les données de l'app.

## Pourquoi une vue web

Instagram ne donne accès aux messages par son API officielle qu'aux comptes professionnels. Pour un compte personnel, la seule voie propre est d'afficher le site mobile d'Instagram, comme le ferait un navigateur, en n'autorisant que les adresses de la messagerie. C'est ce que fait JusteDM.

Trois filets se complètent :

1. chaque chargement de page passe par les règles de `NavigationPolicy.swift` ;
2. chaque changement d'adresse sans rechargement (le site est une application monopage) est rattrapé et annulé ;
3. un script, `guard.js`, arrête les clics refusés avant que le site ne réagisse et cache les menus qui mènent hors de la messagerie.

## Installer l'app sur l'iPhone

Apple n'autorise l'installation d'une app hors App Store que si elle est signée avec un identifiant Apple. Il faut donc un ordinateur pour la première installation.

### Avec un Mac

1. Installer Xcode depuis le Mac App Store.
2. Télécharger ce dépôt (bouton **Code**, puis **Download ZIP**) et ouvrir `JusteDM.xcodeproj`.
3. Dans Xcode, menu **Xcode > Settings > Accounts**, ajouter son identifiant Apple. Un compte gratuit suffit.
4. Cliquer sur le projet **JusteDM** dans la colonne de gauche, puis sur la cible **JusteDM**, onglet **Signing & Capabilities**. Choisir son équipe dans **Team**. Si Xcode refuse l'identifiant `io.github.scarngone.justedm`, le modifier dans **Bundle Identifier** (par exemple en ajoutant ses initiales).
5. Brancher l'iPhone, le choisir comme destination en haut de la fenêtre, puis lancer avec le bouton ▶.
6. Sur l'iPhone, à la première installation : activer **Réglages > Confidentialité et sécurité > Mode développeur**, puis faire confiance au certificat dans **Réglages > Général > VPN et gestion de l'appareil**.

### Sans Mac

Chaque envoi de code sur GitHub compile l'app et produit un fichier `.ipa` non signé.

1. Sur GitHub, connecté à son compte, ouvrir l'onglet **Actions**, cliquer sur la dernière exécution réussie de **JusteDM** et télécharger l'artefact **JusteDM-non-signe** en bas de la page. Le fichier `.zip` obtenu contient `JusteDM-non-signe.ipa`.
2. Installer ce fichier sur l'iPhone depuis un PC Windows ou un Mac avec [Sideloadly](https://sideloadly.io) ou [AltStore](https://altstore.io). Ces deux outils signent l'app avec votre identifiant Apple puis l'installent. Leurs sites détaillent la marche à suivre.
3. Sur l'iPhone, activer le mode développeur et faire confiance au certificat, comme à l'étape 6 ci-dessus.

Ces outils sont indépendants de ce projet. Ils demandent l'identifiant Apple pour signer l'app ; beaucoup d'utilisateurs créent un identifiant secondaire réservé à cet usage.

### Durée de validité

Avec un identifiant Apple gratuit, l'app fonctionne 7 jours, puis il faut la réinstaller (relancer depuis Xcode, ou laisser AltStore la renouveler en Wi-Fi). La session Instagram est conservée d'une installation à l'autre. Avec un compte développeur Apple payant (99 € par an), la validité passe à un an.

## Utiliser l'app

La barre du bas apparaît partout sauf dans une conversation :

- **Boîte de réception** ramène à la liste des conversations ;
- **Recharger** recharge la page ;
- **Réglages** ouvre les options.

Dans une conversation, la flèche de retour d'Instagram ou un balayage depuis le bord gauche ramènent à la liste.

Réglages disponibles :

- **Ouvrir les contenus reçus** : autorise ou non l'ouverture d'une publication, d'un reel ou d'une story reçus en message ;
- **Masquer les menus du site** : cache les boutons d'Instagram qui mènent hors de la messagerie. À désactiver si un élément utile disparaît. Le blocage des pages reste actif dans les deux cas ;
- **Se déconnecter** : efface les cookies et les données du site enregistrés dans l'app.

Deux messages peuvent remplacer la page :

- **« Instagram renvoie vers une autre page »** : le site insiste pour afficher une page bloquée, par exemple une étape de vérification inconnue des règles. L'app s'arrête et affiche l'adresse en cause. Le bouton **Afficher quand même cette page** l'autorise jusqu'à la fermeture de l'app. Cette adresse est alors à ajouter dans `services.json`.
- **« La messagerie ne s'affiche pas »** : la page n'a pas pu se charger, ou Instagram a renvoyé une page vide. Cela arrive quand le site limite une connexion pendant quelques minutes, souvent derrière un VPN.

## Limites connues

- **Pas de notifications.** Une app de ce type ne reçoit pas les notifications d'Instagram. On voit ses messages en ouvrant l'app.
- **Pas encore essayée avec un compte connecté.** Le blocage des pages est vérifié automatiquement, y compris dans un simulateur d'iPhone face au vrai site (voir plus bas). Restent à voir sur un vrai téléphone : la connexion elle-même et le masquage des menus. Ce masquage repose sur les adresses des liens d'Instagram et a été mis au point sur une maquette : il peut demander un ajustement au premier essai réel.
- **Dépendance au site d'Instagram.** Si Instagram change ses adresses ou son site mobile, il faudra adapter `services.json`.
- **Fonctions du site mobile.** L'app offre ce que le site mobile d'Instagram offre dans un navigateur. Les appels et certains formats de message peuvent y être absents.
- **App non officielle.** JusteDM n'est pas affiliée à Instagram ni à Meta.

## Vérifications automatiques

À chaque envoi de code, GitHub lance quatre vérifications :

1. les règles de navigation passent une soixantaine de cas de test, en JavaScript et en Swift ;
2. l'app est compilée pour iPhone ;
3. chaque méthode que l'app fournit à iOS est reconnue par le SDK. Une méthode mal nommée serait ignorée sans erreur ; c'est arrivé une fois pendant l'écriture, pour l'accès au micro ;
4. l'app est lancée dans un simulateur d'iPhone, face au vrai site et sans compte. Elle y tente quatre sorties de la messagerie, par un clic, par deux changements d'adresse sans rechargement et par une navigation en script. Chacune doit être arrêtée.

Instagram répond par une page vide aux machines de GitHub (code 429). La quatrième vérification montre donc que les blocages tiennent dans le vrai moteur web d'iOS, sans montrer la page de connexion elle-même.

## Ajouter un réseau

Un réseau est une entrée de `JusteDM/Resources/services.json`. Les motifs sont des expressions régulières appliquées au chemin de l'adresse.

| Champ | Rôle |
| --- | --- |
| `home`, `login` | Adresse de la messagerie et adresse de connexion |
| `sessionCookie` | Cookie dont la présence indique une session ouverte |
| `hosts` | Domaines du réseau |
| `messaging` | Chemins de la messagerie, toujours affichés |
| `auth` | Chemins de connexion et de sécurité |
| `deny` | Chemins refusés même s'ils correspondent à une autre règle |
| `shared` | Contenus partagés ; le groupe capturé identifie le contenu |
| `extraHosts` | Autres domaines tolérés pour la connexion |
| `redirectors` | Domaines qui enveloppent les liens externes |
| `blockedHosts` | Domaines jamais ouverts quand le site y renvoie |
| `immersive` | Chemins où la barre du bas s'efface |
| `hide`, `navLinks` | Sélecteurs CSS des éléments et des menus à cacher |

L'app affiche pour l'instant le premier réseau du fichier. Le choix entre plusieurs réseaux reste à écrire.

## Développement

```
JusteDM/            app iPhone (UIKit, WKWebView, réglages en SwiftUI)
  Resources/        services.json, guard.js, icône
Core/               règles de navigation, sans dépendance à l'interface
tests/              cas de test communs à Swift et à JavaScript
scripts/            génération du projet Xcode et de l'icône
```

Les règles existent en deux versions, `NavigationPolicy.swift` pour l'app et `createPolicy` dans `guard.js` pour la page. Les deux sont vérifiées avec les mêmes cas, dans `tests/policy-vectors.json`.

```sh
# Règles, version JavaScript
node --test tests/*.test.js

# Règles, version Swift (macOS)
swift test --package-path Core

# Script dans un navigateur, sur la maquette (demande Playwright)
node --test tests/browser/guard-browser.test.js

# Essai dans un simulateur d'iPhone (macOS, après une compilation Debug pour le simulateur)
scripts/simulator_smoke_test.sh chemin/vers/JusteDM.app dossier_de_sortie

# Après avoir ajouté ou retiré un fichier source
gem install xcodeproj
ruby scripts/generate_xcodeproj.rb
```
