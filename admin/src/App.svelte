<!-- Administration : écran de connexion, puis tableau de bord en temps réel -->
<script>
  import Login from './lib/Login.svelte';
  import Dashboard from './lib/Dashboard.svelte';

  let view = $state('checking'); // 'checking' | 'login' | 'dashboard'

  async function check() {
    try {
      const r = await fetch('/admin/api/session', { cache: 'no-store' });
      view = (await r.json()).admin ? 'dashboard' : 'login';
    } catch {
      view = 'login';
    }
  }
  check();
</script>

{#if view === 'login'}
  <Login onlogin={() => (view = 'dashboard')} />
{:else if view === 'dashboard'}
  <Dashboard onlogout={() => (view = 'login')} />
{/if}
