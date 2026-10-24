#!/usr/bin/env bash
# Publication du jeu sur le web par Cloudflare Tunnel.
#
#   scripts/web.sh publish   une seule fois : crée le tunnel et le DNS, puis démarre le projet
#   scripts/web.sh status    état des conteneurs, du tunnel et du site public
#   scripts/web.sh stop      retire le site public (le jeu local continue)
#   scripts/web.sh logs      journaux du tunnel
#
# Ensuite, « docker compose up -d » suffit : le site est publié à chaque démarrage du projet.
# Prérequis : cloudflared connecté au compte (« cloudflared tunnel login » → ~/.cloudflared/cert.pem).
set -euo pipefail

HOSTNAME_PUBLIC="${HOSTNAME_PUBLIC:-echecs.news-analytics.info}"
TUNNEL_NAME="${TUNNEL_NAME:-echecs}"
ORIGIN_CERT="${ORIGIN_CERT:-$HOME/.cloudflared/cert.pem}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/deploy/cloudflared"
CREDS="$DIR/credentials.json"
CONFIG="$DIR/config.yml"
URL="https://$HOSTNAME_PUBLIC"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mErreur : %s\033[0m\n' "$*" >&2; exit 1; }

# Toujours un fichier de configuration minimal : ~/.cloudflared/config.yml (autres tunnels) est ignoré
EMPTY_CONFIG="$(mktemp)"
echo "no-autoupdate: true" > "$EMPTY_CONFIG"
trap 'rm -f "$EMPTY_CONFIG"' EXIT
cf() { cloudflared tunnel --origincert "$ORIGIN_CERT" --config "$EMPTY_CONFIG" --loglevel error "$@"; }
compose() { (cd "$ROOT" && HOST_UID="$(id -u)" HOST_GID="$(id -g)" docker compose "$@"); }

tunnel_id() { cf list --name "$TUNNEL_NAME" --output json 2>/dev/null | jq -r '.[0].id // empty'; }

publish() {
  command -v cloudflared >/dev/null || die "cloudflared n'est pas installé."
  command -v jq >/dev/null || die "jq n'est pas installé."
  [ -f "$ORIGIN_CERT" ] || die "certificat introuvable ($ORIGIN_CERT) : lancez « cloudflared tunnel login »."
  mkdir -p "$DIR" && chmod 700 "$DIR"

  # 1. Tunnel dédié (créé une seule fois ; identifiants récupérés s'ils manquent localement)
  local id; id="$(tunnel_id)"
  if [ -z "$id" ]; then
    say "Création du tunnel « $TUNNEL_NAME »…"
    cf create --credentials-file "$CREDS" "$TUNNEL_NAME" >/dev/null
    id="$(tunnel_id)"
    [ -n "$id" ] || die "le tunnel n'a pas pu être créé."
  elif [ ! -s "$CREDS" ]; then
    say "Tunnel « $TUNNEL_NAME » existant : récupération de ses identifiants…"
    cf token --cred-file "$CREDS" "$TUNNEL_NAME" >/dev/null
  else
    say "Tunnel « $TUNNEL_NAME » déjà créé ($id)."
  fi
  chmod 600 "$CREDS"

  # 2. Enregistrement DNS : echecs.news-analytics.info → tunnel (jamais écrasé s'il sert à autre chose)
  say "DNS : $HOSTNAME_PUBLIC → tunnel…"
  local out
  if ! out="$(cf route dns "$TUNNEL_NAME" "$HOSTNAME_PUBLIC" 2>&1)"; then
    die "impossible de créer le DNS de $HOSTNAME_PUBLIC (un enregistrement existe peut-être déjà pour autre chose) :
$out"
  fi

  # 3. Configuration du tunnel : le public n'atteint que le jeu, par le réseau Docker interne
  cat > "$CONFIG" <<EOF
# Généré par scripts/web.sh — ne pas commiter (contient l'identifiant du tunnel)
tunnel: $id
credentials-file: /etc/cloudflared/credentials.json
no-autoupdate: true
ingress:
  - hostname: $HOSTNAME_PUBLIC
    service: http://chess:8080
  - service: http_status:404
EOF
  chmod 600 "$CONFIG"

  # 4. Démarrage du projet (jeu + tunnel)
  say "Démarrage des conteneurs…"
  compose up -d --build

  # 5. Attente de la mise en ligne
  say "Attente de la mise en ligne de $URL…"
  for _ in $(seq 1 30); do
    if [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL/")" = 200 ]; then
      say "✅ En ligne : $URL"
      return 0
    fi
    sleep 2
  done
  die "le site ne répond pas encore. Voir : scripts/web.sh logs"
}

status() {
  compose ps
  echo
  cf info "$TUNNEL_NAME" 2>/dev/null || echo "Tunnel « $TUNNEL_NAME » introuvable : lancez scripts/web.sh publish"
  echo
  echo "$URL → HTTP $(curl -s -o /dev/null -m 10 -w '%{http_code}' "$URL/" || true)"
}

case "${1:-}" in
  publish) publish ;;
  status)  status ;;
  stop)    compose stop tunnel && say "Site public retiré. Le jeu local continue sur http://localhost:8080." ;;
  logs)    compose logs -f tunnel ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
