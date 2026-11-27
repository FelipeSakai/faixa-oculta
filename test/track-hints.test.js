import assert from 'node:assert/strict';
import test from 'node:test';
import { tracksForOrigins } from '../src/catalog.js';
import { mainArtist, titleInitials } from '../src/track-hints.js';

test('a dica de artista conserva a banda ou dupla inteira e omite os demais créditos', () => {
  const cases = [
    ['Luis Fonsi, Daddy Yankee', 'Luis Fonsi'],
    ['Henrique & Juliano, Marília Mendonça', 'Henrique & Juliano'],
    ['DG e Batidão Stronda, Iguzin, DLIMA7', 'DG e Batidão Stronda'],
    ['Of Monsters and Men', 'Of Monsters and Men'],
    ['Florence + The Machine, Calvin Harris', 'Florence + The Machine'],
    ['AC/DC', 'AC/DC'],
    ['Earth, Wind & Fire', 'Earth, Wind & Fire'],
    ['Ryu, The Runner, Veigh, 6ee', 'Ryu, The Runner'],
    ['Franco, The Sir!', 'Franco, The Sir!'],
    ['Aldeia Records | Andrade | Kawe, Kawe, Andrade', 'Aldeia Records | Andrade | Kawe'],
    ['Primeira Dupla & Banda (feat. Convidado)', 'Primeira Dupla & Banda'],
  ];
  for (const [artist, expected] of cases) assert.equal(mainArtist({ artist }), expected, artist);
});

test('um crédito estruturado conserva a grafia original mesmo com vírgula no nome', () => {
  const artist = 'Texto da versão antiga, Convidado';
  assert.equal(mainArtist({ artist, artists: [{ name: 'Banda, com Vírgula' }, { name: 'Convidado' }] }), 'Banda, com Vírgula');
  assert.equal(mainArtist({ artist, artists: ['Earth, Wind & Fire', 'Convidado'] }), 'Earth, Wind & Fire');
  assert.equal(mainArtist({ artist, artists: [] }), 'Texto da versão antiga');
  assert.equal(mainArtist(null), '');
});

test('as iniciais removem observações da gravação e conservam subtítulos e medleys', () => {
  const cases = [
    ['Smells Like Teen Spirit - Remastered', 'S · L · T · S'],
    ['Smells Like Teen Spirit', 'S · L · T · S'],
    ['I Had Some Help (Feat. Morgan Wallen)', 'I · H · S · H'],
    ['Ballin’ (with Roddy Ricch)', 'B'],
    ['Indomável (Participação especial de Belo)', 'I'],
    ['Cacos De Vidro (sample: Esperar pra Ver)', 'C · D · V'],
    ['Deixe Me Ir (feat. Pablo Martins) - Acústico 1Kilo', 'D · M · I'],
    ['In the Air Tonight - 2015 Remaster', 'I · T · A · T'],
    ['Black Sheep - Brie Larson Vocal Version', 'B · S'],
    ['Spectrum (Say My Name) - Calvin Harris Remix', 'S · S · M · N'],
    ['Ma Meilleure Ennemie - from the series Arcane League of Legends', 'M · M · E'],
    ['Garota de Ipanema (The Girl from Ipanema)', 'G · D · I · T · G · F · I'],
    ['Saudade Estranha - Du Nada - Ao Vivo', 'S · E · D · N'],
    ['Numb / Encore', 'N · E'],
    ['Não Quero Dinheiro (Só Quero Amar)', 'N · Q · D · S · Q · A'],
  ];
  for (const [title, expected] of cases) assert.equal(titleInitials(title), expected, title);
});

test('as iniciais mantêm acentos, contrações e dígitos sem entregar títulos curtos', () => {
  const cases = [
    ['É Tudo Sobre Você / Ser Mudado - Ao Vivo', 'É · T · S · V · S · M'],
    ['U\u0301ltima Saudade (Ao Vivo)', 'Ú · S'],
    ["Can't Get You out of My Head", 'C · G · Y · O · O · M · H'],
    ['Hips Don’t Lie', 'H · D · L'],
    ['Flor e o Beija-Flor (Ao Vivo)', 'F · E · O · B · F'],
    ['505', '5'],
    ['777-666', '7 · 6'],
    ['2 On (feat. ScHoolboy Q)', '2 · O'],
    ['SET DO JAPA NK 2.0', 'S · D · J · N · 2'],
    ['AMG', 'A'],
    ['Y.M.C.A.', 'Y · M · C · A'],
    ['💠', ''],
    [null, ''],
  ];
  for (const [title, expected] of cases) assert.equal(titleInitials(title), expected, title);
});

test('todas as faixas salvas têm dicas, sem modificar os créditos, as origens ou o título', () => {
  const deck = tracksForOrigins();
  const initial = structuredClone(deck);
  for (const track of deck) {
    assert.ok(mainArtist(track), track.artist);
    assert.ok(titleInitials(track.title), track.title);
  }
  assert.deepEqual(deck, initial);
});
