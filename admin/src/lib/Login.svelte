<!-- Connexion par mot de passe (ADMIN_PASSWORD du serveur) -->
<script>
  import Logo from './Logo.svelte';

  let { onlogin } = $props();
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e) {
    e.preventDefault();
    if (!password || busy) return;
    busy = true;
    error = '';
    try {
      const r = await fetch('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { password = ''; onlogin(); }
      else error = data.error || 'Connexion refusée.';
    } catch {
      error = 'Serveur injoignable.';
    }
    busy = false;
  }
</script>

<main>
  <form class="card" onsubmit={submit}>
    <div class="crest"><Logo size={64} /></div>
    <h1>Échiquier</h1>
    <p class="sub">Administration</p>
    <div class="filet"><span></span><i></i><span></span></div>

    <label for="pw">Mot de passe</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="pw" type="password" autocomplete="current-password" bind:value={password} autofocus disabled={busy} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn primary" type="submit" disabled={busy || !password}>{busy ? 'Vérification…' : 'Entrer'}</button>
  </form>
</main>

<style>
  main { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .card {
    width: min(360px, 100%); padding: 34px 30px 28px; text-align: center;
    background: linear-gradient(180deg, var(--panel-2), var(--panel));
    border: 1px solid var(--line); border-radius: 14px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .04);
  }
  .crest { display: flex; justify-content: center; filter: drop-shadow(0 4px 14px rgba(201, 162, 94, .25)); }
  h1 {
    margin: 12px 0 0; font: 700 34px "Cinzel Decorative", var(--serif); letter-spacing: .04em;
    background: linear-gradient(180deg, #f3dc9c, #c9a25e 55%, #8a6a2f); -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub { margin: 2px 0 0; font: 500 12px var(--serif); letter-spacing: .32em; text-transform: uppercase; color: var(--muted); }
  .filet { display: flex; align-items: center; gap: 8px; margin: 16px 0 22px; }
  .filet span { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--gold), transparent); }
  .filet i { width: 6px; height: 6px; transform: rotate(45deg); background: var(--gold); }
  label { display: block; text-align: left; font-size: 12px; color: var(--muted); margin-bottom: 6px; letter-spacing: .03em; }
  input {
    width: 100%; padding: 10px 12px; border-radius: 8px; font: inherit; color: var(--text);
    background: var(--bg-2); border: 1px solid rgba(255, 255, 255, .12); outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201, 162, 94, .15); }
  .error { margin: 10px 0 0; color: var(--danger); font-size: 13px; text-align: left; }
  .btn { width: 100%; justify-content: center; margin-top: 18px; padding: 10px; font-size: 14px; }
</style>
