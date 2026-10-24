// Anticrénelage : plusieurs modes au choix, appliqués au rendu de la scène principale.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, scene.js.
// Les modules de post-traitement de Three.js ne sont téléchargés qu'au premier choix d'un mode
// qui en a besoin (le mode par défaut, « Natif », n'en utilise aucun).
//
// « Natif » rend directement à l'écran (lissage MSAA du navigateur). Les autres modes passent
// par une chaîne de post-traitement : la scène est rendue dans une image intermédiaire, puis
// l'OutputPass applique le même traitement des couleurs (tone mapping, sRGB) qu'à l'écran,
// avant un éventuel filtre de lissage (FXAA, SMAA).
const AA = (() => {
  const MODES = {
    native: { label: 'Natif (navigateur)' },
    off:    { label: 'Désactivé' },
    fxaa:   { label: 'FXAA (rapide)' },
    smaa:   { label: 'SMAA (contours fins)' },
    msaa4:  { label: 'MSAA ×4', samples: 4 },
    msaa8:  { label: 'MSAA ×8', samples: 8 },
    ssaa2:  { label: 'Suréchantillonnage ×2', scale: 2 },
  };
  const BASE_RATIO = Math.min(window.devicePixelRatio, 2);
  let mode = 'native';
  let composer = null, fxaaPass = null;

  // Modules chargés à la demande, par groupe (résolus par l'importmap d'index.html)
  const ADDONS = {
    base: ['postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/OutputPass.js'],
    fxaa: ['postprocessing/ShaderPass.js', 'shaders/FXAAShader.js'],
    smaa: ['postprocessing/SMAAPass.js'],
  };
  const lib = {}, loading = {};
  const load = group => loading[group] ??= Promise.all(ADDONS[group].map(f => import('three/addons/' + f)))
    .then(mods => mods.forEach(m => Object.assign(lib, m)))
    .catch(err => { delete loading[group]; throw err; });
  let request = 0; // le dernier mode choisi l'emporte

  const size = () => [window.innerWidth, window.innerHeight];

  function disposeComposer() {
    if (!composer) return;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    for (const p of composer.passes) p.dispose?.();
    composer = null;
    fxaaPass = null;
  }

  function buildComposer(m) {
    const [w, h] = size();
    const samples = Math.min(MODES[m].samples || 0, renderer.capabilities.maxSamples);
    const target = new THREE.WebGLRenderTarget(w * BASE_RATIO, h * BASE_RATIO, { type: THREE.HalfFloatType, samples });
    const { EffectComposer, RenderPass, OutputPass, ShaderPass, FXAAShader, SMAAPass } = lib;
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(BASE_RATIO);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new OutputPass()); // tone mapping + sRGB, comme le rendu direct
    if (m === 'fxaa') {
      fxaaPass = new ShaderPass(FXAAShader);
      composer.addPass(fxaaPass);
    } else if (m === 'smaa') {
      composer.addPass(new SMAAPass(w * BASE_RATIO, h * BASE_RATIO));
    }
    updateFxaa();
  }

  function updateFxaa() {
    if (!fxaaPass) return;
    const [w, h] = size(), r = renderer.getPixelRatio();
    fxaaPass.material.uniforms.resolution.value.set(1 / (w * r), 1 / (h * r));
  }

  function setMode(m) {
    if (!MODES[m]) m = 'native';
    mode = m;
    const req = ++request;
    disposeComposer();
    renderer.setPixelRatio(BASE_RATIO * (MODES[m].scale || 1));
    renderer.setSize(...size());
    if (m !== 'native' && m !== 'ssaa2') {
      // Rendu direct le temps du téléchargement, puis chaîne de post-traitement
      const groups = ['base', ...(ADDONS[m] ? [m] : [])];
      Promise.all(groups.map(load))
        .then(() => { if (req === request) buildComposer(m); })
        .catch(err => console.error('Anticrénelage : modules introuvables', err));
    }
    try { localStorage.setItem('chess3d:aa', m); } catch { }
    return mode;
  }

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function resize() {
    const [w, h] = size();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    updateFxaa();
  }

  let saved = null;
  try { saved = localStorage.getItem('chess3d:aa'); } catch { }
  setMode(saved || 'native');

  return {
    MODES, setMode, render, resize,
    get mode() { return mode; },
    get label() { return MODES[mode].label; },
  };
})();
