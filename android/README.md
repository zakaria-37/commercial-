# MARIA BAG — application Android (APK)

L'application ouvre la plateforme https://commercial-tf07.onrender.com en plein écran via Chrome
(Trusted Web Activity) : PDF, partage, hors ligne et mises à jour fonctionnent comme sur le site.
Une mise à jour du site n'oblige PAS à réinstaller l'application.

- Téléchargement : https://commercial-tf07.onrender.com/maria-bag.apk
- Lien site ↔ application (plein écran sans barre d'adresse) : /.well-known/assetlinks.json
  (empreinte SHA-256 du certificat de `maria-bag.keystore`).
- `maria-bag.keystore` : clé de signature (dépôt privé). NE PAS la perdre ni la changer :
  une nouvelle clé oblige à désinstaller l'ancienne application.

Reconstruire (Android SDK 34 + build-tools 34) :
    cd android && echo "sdk.dir=/chemin/android-sdk" > local.properties
    gradle assembleRelease      # → app/build/outputs/apk/release/app-release.apk
    cp app/build/outputs/apk/release/app-release.apk ../maria-bag.apk
Avant chaque nouvelle version : augmenter versionCode dans app/build.gradle.
