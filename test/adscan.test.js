'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { adKeysFromText, adKeysFromJson, unitIsAd } = require('../adscan.js');

const adEdge = {
  node: {
    comet_sections: {
      content: { story: { message: { text: 'Open a business checking account today. Enjoy no fees.' } } },
      attachment: { title_with_entities: { text: 'Check for card offers now' }, description: { text: 'See if you will be approved for offers' } },
      feedback: {
        story: {
          tracking: JSON.stringify({ adid: '1', is_sponsored: 1, page_id: '2' }),
          feedback_context: { comment_composer_placeholder: 'Comment as Some Viewer' },
        },
      },
    },
  },
};
const organicEdge = {
  node: {
    comet_sections: {
      content: { story: { message: { text: 'Made sourdough bread today and it came out great.' } } },
      feedback: {
        story: {
          tracking: JSON.stringify({ is_sponsored: 0 }),
          feedback_context: { comment_composer_placeholder: 'Comment as Some Viewer' },
        },
      },
    },
  },
};
const doc = { data: { viewer: { news_feed: { edges: [organicEdge, adEdge] } } } };

test('only the ad unit contributes keys, and only from text fields', () => {
  const keys = adKeysFromJson(doc);
  assert.ok(keys.some(k => k.startsWith('open a business checking account')));
  assert.ok(keys.some(k => k.startsWith('check for card offers')));
  assert.ok(!keys.some(k => k.includes('sourdough')));
  assert.ok(!keys.some(k => k.includes('comment as')), 'UI placeholder must not become a key');
});

test('NDJSON, partial lines and the for(;;); prefix are read', () => {
  const body = 'for (;;);' + JSON.stringify(doc) + '\n{"data":{"node":{"x":\n' + JSON.stringify({ data: { node: adEdge.node } });
  const keys = adKeysFromText(body);
  assert.ok(keys.some(k => k.startsWith('open a business checking account')));
});

test('a response with no ad marker is skipped without parsing', () => {
  assert.deepEqual(adKeysFromText(JSON.stringify({ data: { node: organicEdge.node } })), []);
  assert.deepEqual(adKeysFromText('not json'), []);
});

test('a video ad with th_dat_spo and no message is keyed on its link title', () => {
  const videoAd = {
    data: { node: {
      th_dat_spo: { client_token: 'x' },
      comet_sections: { attachment: { action_links: { link_title: 'Learn CPR in two minutes, it could save a life', link_description: 'A proud national sponsor of lifesaver training' } } },
    } },
  };
  const keys = adKeysFromJson(videoAd);
  assert.ok(keys.some(k => k.startsWith('learn cpr in two minutes')));
  assert.ok(keys.some(k => k.startsWith('a proud national sponsor')));
  const organic = { data: { node: { th_dat_spo: null, comet_sections: { attachment: { action_links: { link_title: 'A recipe for lemon bars everyone loves' } } } } } };
  assert.deepEqual(adKeysFromJson(organic), []);
});

test('right-rail ad object with sponsored_data yields title and description', () => {
  const side = { nodes: [{ rhc_ad: { title: 'The AI for problem solvers | Claude', description: 'A product designer explains how it was built', sponsored_data: { ad_id: '9' } } }] };
  const keys = adKeysFromJson(side);
  assert.ok(keys.some(k => k.startsWith('the ai for problem solvers')));
  assert.ok(keys.some(k => k.startsWith('a product designer explains')));
});

test('unitIsAd matches by normalized text and ignores unrelated units', () => {
  const keys = new Set(adKeysFromJson(doc));
  assert.equal(unitIsAd('U.S. Bank\nAd\nOpen a  business\nchecking account today. Enjoy no fees.', keys), true);
  assert.equal(unitIsAd('Sam Lee\nMade sourdough bread today and it came out great.', keys), false);
  assert.equal(unitIsAd('anything', new Set()), false);
});
