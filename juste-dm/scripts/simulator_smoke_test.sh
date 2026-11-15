#!/bin/bash
# Lance l'app dans un simulateur d'iPhone avec son essai automatique (-JusteDMSelfTest),
# puis garde le journal de l'app et deux captures d'écran.
#
#   scripts/simulator_smoke_test.sh chemin/vers/JusteDM.app dossier_de_sortie
#
# L'app doit avoir été compilée en configuration Debug pour le simulateur.
set -euo pipefail

app="$1"
out="$2"
bundle="io.github.scarngone.justedm"
mkdir -p "$out"

udid=$(xcrun simctl list devices available -j | python3 -c '
import json, sys

runtimes = json.load(sys.stdin)["devices"]
for runtime in sorted(runtimes, reverse=True):
    if "iOS" not in runtime:
        continue
    for device in runtimes[runtime]:
        if device["name"].startswith("iPhone"):
            print(device["udid"])
            sys.exit(0)
sys.exit("aucun simulateur iPhone disponible")
')
echo "Simulateur choisi :"
xcrun simctl list devices available | grep "$udid" || echo "$udid"

xcrun simctl boot "$udid" || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app"

xcrun simctl launch --console-pty "$udid" "$bundle" \
  -JusteDMSelfTest -AppleLanguages "(fr)" -AppleLocale fr_FR \
  > "$out/journal.txt" 2>&1 &
launcher=$!

sleep 15
xcrun simctl io "$udid" screenshot "$out/1-ouverture.png"
sleep 60
xcrun simctl io "$udid" screenshot "$out/2-apres-essai.png"

xcrun simctl terminate "$udid" "$bundle" || true
wait "$launcher" 2>/dev/null || true
xcrun simctl shutdown "$udid" || true

echo "===== Journal de l'app ====="
cat "$out/journal.txt"
echo "===== Fin du journal ====="

if ! grep -q "essai terminé" "$out/journal.txt"; then
  echo "L'essai automatique n'est pas allé au bout."
  exit 1
fi
