// Thème « Cristal » : les pièces classiques taillées dans du verre.
// Comme sur les échiquiers de verre traditionnels, les camps diffèrent par l'aspect et par la teinte :
// Blancs : verre dépoli blanc laiteux (mat, clair). Noirs : verre fumé lisse (brillant, sombre).
// Script classique (chargé après pieces.js). Dépend de : THREE, pieces.js (THEMES, registerTheme).
//
// Le verre utilise la transmission physique de Three.js : la scène derrière la pièce est vue
// à travers, réfractée et teintée selon l'épaisseur traversée (attenuation*).
(() => {
  const glass = (opts) => new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.03,
    transmission: 1,          // verre : la lumière traverse
    ior: 1.52,                // indice du cristal
    thickness: 0.9,           // épaisseur moyenne (unités du modèle) pour la réfraction
    specularIntensity: 1,
    clearcoat: 1,             // vernis : reflets nets sur les arêtes
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.35,
    ...opts,
  });

  // Blancs : verre dépoli laiteux. La surface rugueuse diffuse la lumière et une part de
  // couleur propre (transmission < 1) le garde clair sur n'importe quelle case.
  const frosted = glass({
    color: 0xf3f5f9,
    roughness: 0.3,
    transmission: 0.85,
    thickness: 1.2,
    attenuationColor: 0xffffff,
    attenuationDistance: 3,
    clearcoat: 0.6,             // fin vernis : quelques reflets de verre sur le dépoli
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2,
  });
  // Noirs : verre fumé lisse et profond, reflets nets
  const smoked = glass({
    color: 0xc9cdd8,
    attenuationColor: 0x181c2a, // s'assombrit avec l'épaisseur, translucide sur les bords
    attenuationDistance: 0.9,
    envMapIntensity: 1.6,       // reflets un peu plus forts pour lire la forme sur fond sombre
  });

  registerTheme('crystal', {
    name: 'Cristal',
    shape: 'classic', // mêmes modèles que le thème Classique (socles, orientation)
    builders: THEMES.classic.builders,
    materials: white => ({ body: white ? frosted : smoked }),
  });
})();
