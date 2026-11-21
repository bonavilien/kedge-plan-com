/* Plan de com — ranger un secret dans GitHub depuis le navigateur : GitHub demande qu'il soit chiffré en
   « sealed box » (crypto_box_seal de libsodium) avec la clé publique du dépôt. Rien ne part en clair.
   S'appuie sur tweetnacl (vendor/tweetnacl-1.0.3.min.js, domaine public) et sur un BLAKE2b minimal (RFC 7693),
   qui calcule le nonce : BLAKE2b-192(clé publique éphémère ‖ clé publique du dépôt). */
(function (root, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique;
  else root.KPscelle = fabrique(root.nacl);
})(typeof self !== "undefined" ? self : this, function (nacl) {
  /* ---------- BLAKE2b : mots de 64 bits tenus en paires de 32 bits (poids faible d'abord) ---------- */
  const IV = new Uint32Array([0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
    0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19]);
  const SIGMA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
    11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4, 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
    9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13, 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
    12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11, 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
    6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5, 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3].map((x) => x * 2);
  const v = new Uint32Array(32), m = new Uint32Array(32);
  const add = (a, b) => { const o0 = v[a] + v[b]; let o1 = v[a + 1] + v[b + 1]; if (o0 >= 0x100000000) o1++; v[a] = o0; v[a + 1] = o1; };
  const addc = (a, b0, b1) => { let o0 = v[a] + b0; if (b0 < 0) o0 += 0x100000000; let o1 = v[a + 1] + b1; if (o0 >= 0x100000000) o1++; v[a] = o0; v[a + 1] = o1; };
  const get32 = (b, i) => b[i] ^ (b[i + 1] << 8) ^ (b[i + 2] << 16) ^ (b[i + 3] << 24);
  function G(a, b, c, d, ix, iy) {
    let x0, x1;
    add(a, b); addc(a, m[ix], m[ix + 1]);
    x0 = v[d] ^ v[a]; x1 = v[d + 1] ^ v[a + 1]; v[d] = x1; v[d + 1] = x0;
    add(c, d);
    x0 = v[b] ^ v[c]; x1 = v[b + 1] ^ v[c + 1]; v[b] = (x0 >>> 24) ^ (x1 << 8); v[b + 1] = (x1 >>> 24) ^ (x0 << 8);
    add(a, b); addc(a, m[iy], m[iy + 1]);
    x0 = v[d] ^ v[a]; x1 = v[d + 1] ^ v[a + 1]; v[d] = (x0 >>> 16) ^ (x1 << 16); v[d + 1] = (x1 >>> 16) ^ (x0 << 16);
    add(c, d);
    x0 = v[b] ^ v[c]; x1 = v[b + 1] ^ v[c + 1]; v[b] = (x1 >>> 31) ^ (x0 << 1); v[b + 1] = (x0 >>> 31) ^ (x1 << 1);
  }
  function compresser(h, bloc, t, dernier) {
    for (let i = 0; i < 16; i++) { v[i] = h[i]; v[i + 16] = IV[i]; }
    v[24] ^= t; v[25] ^= t / 0x100000000;
    if (dernier) { v[28] = ~v[28]; v[29] = ~v[29]; }
    for (let i = 0; i < 32; i++) m[i] = get32(bloc, 4 * i);
    for (let r = 0; r < 12; r++) {
      const s = r * 16;
      G(0, 8, 16, 24, SIGMA[s], SIGMA[s + 1]); G(2, 10, 18, 26, SIGMA[s + 2], SIGMA[s + 3]);
      G(4, 12, 20, 28, SIGMA[s + 4], SIGMA[s + 5]); G(6, 14, 22, 30, SIGMA[s + 6], SIGMA[s + 7]);
      G(0, 10, 20, 30, SIGMA[s + 8], SIGMA[s + 9]); G(2, 12, 22, 24, SIGMA[s + 10], SIGMA[s + 11]);
      G(4, 14, 16, 26, SIGMA[s + 12], SIGMA[s + 13]); G(6, 8, 18, 28, SIGMA[s + 14], SIGMA[s + 15]);
    }
    for (let i = 0; i < 16; i++) h[i] = h[i] ^ v[i] ^ v[i + 16];
  }
  function blake2b(donnees, n) {
    const h = new Uint32Array(IV); h[0] ^= 0x01010000 ^ n;
    const bloc = new Uint8Array(128); let c = 0, t = 0;
    for (let i = 0; i < donnees.length; i++) { if (c === 128) { t += c; compresser(h, bloc, t, false); c = 0; } bloc[c++] = donnees[i]; }
    t += c; while (c < 128) bloc[c++] = 0; compresser(h, bloc, t, true);
    const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = h[i >> 2] >> (8 * (i & 3));
    return out;
  }

  /* ---------- sealed box ---------- */
  const joindre = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const b64 = { de: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), vers: (u) => btoa(String.fromCharCode.apply(null, Array.from(u))) };
  function sceller(message, clePublique) {
    const ek = nacl.box.keyPair(), nonce = blake2b(joindre(ek.publicKey, clePublique), 24);
    return joindre(ek.publicKey, nacl.box(message, nonce, clePublique, ek.secretKey));
  }
  /* texte en clair + clé publique du dépôt (base64, telle que GitHub la donne) → valeur chiffrée (base64) */
  const pourGitHub = (texte, cleB64) => b64.vers(sceller(new TextEncoder().encode(texte), b64.de(cleB64)));
  return { blake2b, sceller, pourGitHub };
});
