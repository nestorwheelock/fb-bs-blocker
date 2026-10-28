'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { classify } = require('../classify.js');

const f = (lines, hrefs = []) => ({ lines, hrefs });

test('plain friend post is kept', () => {
  assert.equal(classify(f(['Sam Lee', '2h', 'Made bread today']), {}).hide, false);
});

test('Sponsored line hides as ad', () => {
  const r = classify(f(['Acme', 'Sponsored', 'Buy now']), {});
  assert.deepEqual([r.hide, r.reason], [true, 'ad']);
});

test('Ad label hides as ad, the word inside a sentence does not', () => {
  assert.equal(classify(f(['Zoom Room Dog Training', 'Ad', 'Give your puppy the best start']), {}).reason, 'ad');
  assert.equal(classify(f(['Sam Lee', 'Ad blockers are great']), {}).hide, false);
});

test('ads href hides as ad', () => {
  const r = classify(f(['Acme', 'Buy now'], ['https://www.facebook.com/ads/about/?id=1']), {});
  assert.equal(r.reason, 'ad');
});

test('follow suggestion hides', () => {
  assert.equal(classify(f(['Page', '·', 'Follow', 'text']), {}).reason, 'suggestion');
  assert.equal(classify(f(['People you may know']), {}).reason, 'suggestion');
  assert.equal(classify(f(['Because you follow Cooking']), {}).reason, 'suggestion');
});

test('politics matches whole words only', () => {
  assert.equal(classify(f(['Vote Trump 2028']), {}).reason, 'politics');
  assert.equal(classify(f(['The selection of cheeses']), {}).hide, false);
  assert.equal(classify(f(['Senate passes bill']), {}).detail, 'senate');
});

test('extra keywords extend and allow keywords override', () => {
  assert.equal(classify(f(['cryptocurrency pump']), { extraKeywords: ['crypto', 'cryptocurrency'] }).reason, 'politics');
  assert.equal(classify(f(['Trump card game night']), { allowKeywords: ['card game'] }).hide, false);
});

test('the viewer is found past the decoy lines that open every post', () => {
  const { isOwn } = require('../classify.js');
  const decoys = Array(8).fill('Facebook');
  assert.equal(isOwn(decoys.concat(['Nestor Wheelock', '3 hours ago', 'hello']), 'Nestor Wheelock'), true);
  assert.equal(isOwn(decoys.concat(['Sam Lee', '3 hours ago']), 'Nestor Wheelock'), false);
  assert.equal(isOwn(decoys.concat(['Nestor Wheelock']), null), false);
  // a name far down the post (a comment) is not authorship
  assert.equal(isOwn(['Sam Lee', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'Nestor Wheelock'], 'Nestor Wheelock'), false);
});

test('category toggles are respected', () => {
  assert.equal(classify(f(['Sponsored']), { ads: false }).hide, false);
  assert.equal(classify(f(['Follow']), { suggestions: false }).hide, false);
  assert.equal(classify(f(['Trump']), { politics: false }).hide, false);
});
