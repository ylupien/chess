<!-- Tableau de bord en temps réel : parties et connexions (flux /ws/admin) -->
<script>
  import { onMount } from 'svelte';
  import Logo from './Logo.svelte';
  import MiniBoard from './MiniBoard.svelte';
  import { duration, clock, time, bytes, browser, ROOM_STATUS, ROLE, THEMES, BOARDS } from './format.js';

  let { onlogout } = $props();

  let snap = $state(null);      // dernier état reçu du serveur
  let offset = 0;               // décalage entre l'horloge du serveur et la nôtre
  let build = null;             // version de la page au chargement
  let now = $state(Date.now()); // horloge locale (durées et pendules en direct)
  let link = $state('connecting'); // 'connecting' | 'live' | 'lost'
  let filter = $state('all');   // parties : 'all' | 'playing' | 'solo' | 'waiting'

  // Heure du serveur, estimée en continu
  const serverNow = $derived(now - offset);

  // Ordre : parties en ligne en cours, parties solo, puis salles en attente
  const rank = r => r.status === 'playing' ? 0 : r.solo ? 1 : 2;
  const rooms = $derived((snap?.rooms ?? []).slice().sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt));
  const shown = $derived(rooms.filter(r => filter === 'all'
    || (filter === 'playing' ? r.status === 'playing' : filter === 'solo' ? r.solo : !r.solo && r.status !== 'playing')));
  const connections = $derived((snap?.connections ?? []).slice().sort((a, b) => a.since - b.since));
  const counts = $derived({
    playing: rooms.filter(r => r.status === 'playing').length,
    waiting: rooms.filter(r => !r.solo && r.status !== 'playing').length,
    solo: rooms.filter(r => r.solo).length,
    spectators: connections.filter(c => c.role === 'spectator').length,
  });

  // Temps restant d'un camp, décompté en direct pour le camp au trait
  function remaining(c, side) {
    const t = c.rem[side];
    return c.running === side ? t - (serverNow - snap.now) : t;
  }

  const watch = id => window.open(`/?regarder=${encodeURIComponent(id)}`, '_blank', 'noopener');

  async function logout() {
    await fetch('/admin/api/logout', { method: 'POST' }).catch(() => {});
    onlogout();
  }

  onMount(() => {
    let ws, retry = 0, retryTimer, closed = false;
    const tick = setInterval(() => { now = Date.now(); }, 250);

    function open() {
      link = 'connecting';
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/admin`);
      ws.onopen = () => { link = 'live'; retry = 0; };
      ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'snapshot') return;
        // Nouvelle version installée sur le serveur : la page se met à jour d'elle-même
        if (build && msg.build && msg.build !== build) return location.reload();
        build ??= msg.build;
        offset = Date.now() - msg.now;
        snap = msg;
      };
      ws.onclose = async e => {
        if (closed) return;
        link = 'lost';
        // Session terminée (expirée ou déconnexion ailleurs) : retour à l'écran de connexion
        if (e.code === 4001) return onlogout();
        const r = await fetch('/admin/api/session', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
        if (r && !r.admin) return onlogout();
        retryTimer = setTimeout(open, Math.min(10000, 500 * 2 ** retry++)); // reconnexion progressive
      };
    }
    open();
    return () => { closed = true; clearInterval(tick); clearTimeout(retryTimer); ws?.close(); };
  });
</script>

<header>
  <div class="brand">
    <Logo size={34} />
    <div>
      <div class="name">Échiquier</div>
      <div class="sub">Administration</div>
    </div>
  </div>
  <div class="actions">
    <span class="chip {link === 'live' ? 'ok' : link === 'lost' ? 'danger' : 'warn'}">
      {link === 'live' ? 'En direct' : link === 'lost' ? 'Connexion perdue…' : 'Connexion…'}
    </span>
    <span class="mono muted hide-sm">{time(now)}</span>
    <a class="btn" href="/" target="_blank" rel="noopener">Ouvrir le jeu</a>
    <button class="btn" onclick={logout}>Déconnexion</button>
  </div>
</header>

<main>
  {#if !snap}
    <p class="loading muted">Réception de l'état du serveur…</p>
  {:else}
    <section class="stats">
      <div class="stat">
        <span class="label">Connexions</span>
        <span class="value">{connections.length}</span>
        <span class="hint">pic {snap.server.peak} · {snap.server.connectionsTotal} depuis le démarrage</span>
      </div>
      <div class="stat">
        <span class="label">Parties en cours</span>
        <span class="value">{counts.playing}</span>
        <span class="hint">{snap.server.gamesStarted} commencée{snap.server.gamesStarted > 1 ? 's' : ''} au total</span>
      </div>
      <div class="stat">
        <span class="label">Parties solo</span>
        <span class="value">{counts.solo}</span>
        <span class="hint">joueurs seuls face à l'échiquier</span>
      </div>
      <div class="stat">
        <span class="label">En attente</span>
        <span class="value">{counts.waiting}</span>
        <span class="hint">salles ouvertes · max {snap.server.maxRooms}</span>
      </div>
      <div class="stat">
        <span class="label">Spectateurs</span>
        <span class="value">{counts.spectators}</span>
        <span class="hint">administrateurs qui regardent</span>
      </div>
      <div class="stat">
        <span class="label">Serveur</span>
        <span class="value small">{duration(serverNow - snap.server.bootAt)}</span>
        <span class="hint">{bytes(snap.server.rss)} · Node {snap.server.node}</span>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Parties</h2>
        <div class="seg" role="tablist">
          <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>Toutes <b>{rooms.length}</b></button>
          <button class:active={filter === 'playing'} onclick={() => (filter = 'playing')}>En ligne <b>{counts.playing}</b></button>
          <button class:active={filter === 'solo'} onclick={() => (filter = 'solo')}>Solo <b>{counts.solo}</b></button>
          <button class:active={filter === 'waiting'} onclick={() => (filter = 'waiting')}>En attente <b>{counts.waiting}</b></button>
        </div>
      </div>

      {#if shown.length === 0}
        <div class="empty">
          <span class="glyph">♞</span>
          <p>Aucune partie {filter === 'playing' ? 'en ligne' : filter === 'solo' ? 'solo' : filter === 'waiting' ? 'en attente' : 'pour le moment'}.</p>
          <p class="faint">Les parties apparaissent ici dès qu'un joueur crée une invitation.</p>
        </div>
      {:else}
        <div class="games">
          {#each shown as r (r.id)}
            {@const st = ROOM_STATUS[r.status] ?? { label: r.status, tone: 'muted' }}
            <button class="game" onclick={() => watch(r.id)} title="Regarder la partie en direct">
              <div class="game-top">
                <span class="chip {st.tone}">{st.label}</span>
                <span class="mono faint">{r.id}</span>
                {#if r.spectators}
                  <span class="eye" title="Spectateurs">
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>
                    {r.spectators}
                  </span>
                {/if}
              </div>
              <div class="game-body">
                <MiniBoard line={r.line} position={r.position} lastMove={r.lastSq} size={128} />
                <div class="players">
                  {#if r.solo}
                    <div class="player turn">
                      <span class="dot on" title="Connecté"></span>
                      <span class="glyph">♔♚</span>
                      <span class="pname">Joueur seul · <span class="mono faint">{r.ip}</span></span>
                    </div>
                    <div class="player">
                      <span class="glyph">{r.turn === 'w' ? '♔' : '♚'}</span>
                      <span class="pname muted">{r.status === 'free' ? 'Placement libre' : `Trait aux ${r.turn === 'w' ? 'Blancs' : 'Noirs'}`}</span>
                    </div>
                  {:else}
                  {#each [['w', '♔', r.white, r.whiteOnline], ['b', '♚', r.black, r.blackOnline]] as [side, glyph, name, online]}
                    <div class="player" class:turn={r.status === 'playing' && r.turn === side && !r.clock.flagged}>
                      <span class="dot" class:on={online} title={online ? 'Connecté' : 'Déconnecté'}></span>
                      <span class="glyph">{glyph}</span>
                      <span class="pname">{name || (side === 'b' ? (r.blackOnline ? 'Saisie du nom…' : 'En attente…') : '—')}</span>
                      {#if r.clock.id !== 'none'}
                        <span class="clk mono" class:run={r.clock.running === side} class:low={remaining(r.clock, side) < 30000}
                          class:flag={r.clock.flagged === side}>{clock(remaining(r.clock, side))}</span>
                      {/if}
                    </div>
                  {/each}
                  {/if}
                  <dl>
                    <dt>Coups</dt><dd>{r.moves}{#if r.last}<span class="mono faint"> · {r.last}</span>{/if}</dd>
                    <dt>{r.startedAt ? 'Durée' : 'Ouverte'}</dt>
                    <dd>{duration(serverNow - (r.startedAt || r.createdAt))}{#if r.games > 1}<span class="faint"> · partie {r.games}</span>{/if}</dd>
                    {#if r.theme}<dt>Style</dt><dd>{THEMES[r.theme] ?? r.theme} · {BOARDS[r.board] ?? r.board}</dd>{/if}
                  </dl>
                </div>
              </div>
              <span class="watch">Regarder la partie →</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section>
      <div class="section-head"><h2>Connexions</h2><span class="muted">{connections.length} ouverte{connections.length > 1 ? 's' : ''}</span></div>
      {#if connections.length === 0}
        <div class="empty small"><p>Aucun joueur connecté.</p></div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Rôle</th><th>Nom</th><th>Partie</th><th>Adresse</th><th>Navigateur</th><th>Connecté depuis</th><th class="num">Messages</th></tr>
            </thead>
            <tbody>
              {#each connections as c (c.id)}
                {@const role = ROLE[c.role] ?? ROLE.lobby}
                <tr class:clickable={!!c.room} onclick={() => c.room && watch(c.room)} title={c.room ? 'Regarder sa partie' : ''}>
                  <td class="mono faint">{c.id}</td>
                  <td><span class="chip {role.tone}">{role.label}</span>{#if c.admin}<span class="admin" title="Session d'administration">★</span>{/if}</td>
                  <td>{c.name || '—'}</td>
                  <td>{#if c.room}<span class="mono link">{c.room}</span>{:else}<span class="faint">—</span>{/if}</td>
                  <td class="mono">{c.ip}</td>
                  <td class="muted" title={c.ua}>{browser(c.ua)}</td>
                  <td>{duration(serverNow - c.since)} <span class="faint">· {time(c.since)}</span></td>
                  <td class="num mono">{c.msgs}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</main>

<style>
  header {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    padding: 12px max(16px, calc((100vw - 1240px) / 2));
    background: rgba(13, 13, 16, .86); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .name { font: 700 22px "Cinzel Decorative", var(--serif); letter-spacing: .04em; color: var(--gold-2); line-height: 1.1; }
  .sub { font: 500 10.5px var(--serif); letter-spacing: .34em; text-transform: uppercase; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  main { max-width: 1240px; margin: 0 auto; padding: 24px 16px 60px; }
  .loading { text-align: center; padding: 80px 0; }
  section { margin-bottom: 34px; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
  .stat {
    display: flex; flex-direction: column; gap: 2px; padding: 14px 16px;
    background: linear-gradient(180deg, var(--panel-2), var(--panel));
    border: 1px solid var(--line-soft); border-top: 2px solid var(--gold-3); border-radius: 10px;
  }
  .stat .label { font: 600 11px var(--serif); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .stat .value { font: 600 30px var(--serif); color: var(--text); font-variant-numeric: tabular-nums; }
  .stat .value.small { font-size: 22px; padding: 4px 0 3px; }
  .stat .hint { font-size: 12px; color: var(--faint); }

  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  h2 {
    margin: 0; font: 600 17px var(--serif); letter-spacing: .12em; text-transform: uppercase; color: var(--gold);
    display: flex; align-items: center; gap: 12px;
  }
  h2::after { content: ""; width: 60px; height: 1px; background: linear-gradient(90deg, var(--gold), transparent); }

  .seg { display: flex; border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; overflow: hidden; }
  .seg button { background: none; border: 0; padding: 6px 12px; cursor: pointer; font-size: 12.5px; color: var(--muted); }
  .seg button + button { border-left: 1px solid rgba(255, 255, 255, .08); }
  .seg button b { font-weight: 600; margin-left: 4px; color: var(--faint); }
  .seg button.active { background: rgba(201, 162, 94, .14); color: var(--gold-2); }
  .seg button.active b { color: var(--gold); }

  .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 14px; }
  .game {
    display: flex; flex-direction: column; gap: 12px; text-align: left; cursor: pointer;
    padding: 14px; border-radius: 12px; background: linear-gradient(180deg, var(--panel-2), var(--panel));
    border: 1px solid var(--line-soft); transition: border-color .15s, transform .15s, box-shadow .15s;
  }
  .game:hover { border-color: var(--gold); transform: translateY(-1px); box-shadow: 0 10px 30px rgba(0, 0, 0, .4); }
  .game:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .game-top { display: flex; align-items: center; gap: 10px; }
  .game-top .eye { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--gold); }
  .game-body { display: flex; gap: 14px; align-items: flex-start; }
  .players { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .player {
    display: flex; align-items: center; gap: 7px; padding: 5px 8px; border-radius: 7px;
    background: rgba(255, 255, 255, .025); border: 1px solid transparent;
  }
  .player.turn { border-color: rgba(201, 162, 94, .45); background: rgba(201, 162, 94, .07); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
  .dot.on { background: var(--ok); box-shadow: 0 0 6px rgba(127, 176, 138, .7); }
  .player .glyph { font-size: 16px; color: var(--gold); }
  .pname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .clk { padding: 1px 6px; border-radius: 4px; background: rgba(0, 0, 0, .35); color: var(--muted); }
  .clk.run { color: var(--text); background: rgba(201, 162, 94, .2); }
  .clk.low.run { color: var(--warn); }
  .clk.flag { color: var(--danger); text-decoration: line-through; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 4px 0 0; font-size: 12.5px; }
  dt { color: var(--faint); }
  dd { margin: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .watch { align-self: flex-end; font-size: 12.5px; color: var(--gold); letter-spacing: .02em; opacity: .75; transition: opacity .15s; }
  .game:hover .watch { opacity: 1; }

  .empty {
    text-align: center; padding: 40px 16px; border: 1px dashed rgba(201, 162, 94, .22); border-radius: 12px; color: var(--muted);
  }
  .empty.small { padding: 22px 16px; }
  .empty .glyph { font-size: 38px; color: var(--gold-3); }
  .empty p { margin: 6px 0 0; }

  .table-wrap { overflow-x: auto; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--panel); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; padding: 10px 12px; white-space: nowrap;
    font: 600 10.5px var(--serif); letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
    border-bottom: 1px solid var(--line); background: var(--panel-2);
  }
  td { padding: 9px 12px; border-bottom: 1px solid var(--line-soft); white-space: nowrap; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:nth-child(even) td { background: rgba(255, 255, 255, .015); }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover td { background: rgba(201, 162, 94, .07); }
  .num { text-align: right; }
  .link { color: var(--gold-2); }
  .admin { margin-left: 6px; color: var(--gold); }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
    .game-body { flex-direction: column; align-items: center; }
    .players { width: 100%; }
  }
</style>
