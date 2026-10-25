#!/usr/bin/env bash
# Attend que le GPU soit libre avant de lancer un calcul : utilisation et mémoire
# sous les seuils pendant plusieurs relevés de suite.
#
#   GPU_MAX_UTIL  : % d'utilisation maximum (défaut 15)
#   GPU_MAX_MEM   : Mo de mémoire déjà occupée maximum (défaut 1500)
#   GPU_CALME     : nombre de relevés calmes consécutifs exigés (défaut 6, un toutes les 10 s)
set -euo pipefail

MAX_UTIL="${GPU_MAX_UTIL:-15}"
MAX_MEM="${GPU_MAX_MEM:-1500}"
CALME="${GPU_CALME:-6}"

ok=0
while [ "$ok" -lt "$CALME" ]; do
  read -r util mem < <(nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits | head -1 | tr -d ',')
  if [ "$util" -le "$MAX_UTIL" ] && [ "$mem" -le "$MAX_MEM" ]; then
    ok=$((ok + 1))
  else
    [ "$ok" -gt 0 ] && echo
    ok=0
  fi
  printf '\rGPU : %3s %% | %5s Mo occupés | calme %d/%d ' "$util" "$mem" "$ok" "$CALME"
  [ "$ok" -lt "$CALME" ] && sleep 10
done
echo
echo "GPU libre."
