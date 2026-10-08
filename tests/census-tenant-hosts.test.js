// tests/census-tenant-hosts.test.js -- an institution's own tenant on a vendor host is host evidence,
// and is scored as such (a dom rule on the link/form/iframe, +70) instead of as a bare html substring
// (+40, under the ledger floor of 50). Before this, three audited-right detections sat at 40 because
// the only thing that had lifted them to 80 was a second html rule on the same word (removed by the
// wildcard rewrite). All snippets are verbatim from cohort 140.
const { test } = require('node:test');
const assert = require('node:assert');
const { score, FLOOR } = require('./helpers/census-page.js');

// ----------------------------------------------------------------------- Salesforce Education Cloud
test('Salesforce Sites: an institution\'s own org link clears the floor (North American University, 4471, audited right)', () => {
  const html = '<a target="_blank" rel="noopener noreferrer" href="https://nau.my.salesforce-sites.com/form?formid=217727" class="fusion-bar-highlight"><span>Request Info</span></a>';
  assert.ok(score('Salesforce Education Cloud', html) >= FLOOR);
});

test('Salesforce Sites: an RFI endpoint in inline JS clears the floor (Oregon State, 263, audited right)', () => {
  const html = '<script>if($("#comments").val().length==0){var value=formatResponses();xhttp.open("POST","https://oregonstate.my.salesforce-sites.com/forms/services/apexrest/ugradrfi/"+service+":noemail"+bistatus,true);}</script>';
  assert.ok(score('Salesforce Education Cloud', html) >= FLOOR);
});

test('Salesforce Sites: forms and iframes on an org host count like links', () => {
  assert.ok(score('Salesforce Education Cloud', '<a href="https://bellevuecollege.my.salesforce-sites.com/events#/list?type=Campus%20Tour">Tour</a>') >= FLOOR); // 680
  assert.ok(score('Salesforce Education Cloud', '<iframe src="https://bushnelluniversity.my.salesforce-sites.com/inquiry/TargetX_Base__InquiryForm"></iframe>') >= FLOOR); // 1004 host
});

test('Salesforce Sites: a third-party vendor\'s org is not the institution\'s Salesforce', () => {
  // SpanTran's credential-evaluation application, linked from 10 institutions' admissions pages (128 here).
  const spantran = '<p><a class="ctaLink" href="https://spanside.my.salesforce-sites.com/SpantranApplication?Id=3a82283d-e4bd-4ded-a666-3811a31bdea5"><span>Access the TEC Application - UDC</span></a></p>';
  assert.ok(score('Salesforce Education Cloud', spantran) < FLOOR);
});

// ------------------------------------------------------------------------------------------- Populi
test('Populi: a *.populiweb.com tenant link or embed clears the floor', () => {
  assert.ok(score('Populi', '<a class="linkBtn" target="__blank" href="https://wust.populiweb.com/">Populi</a>') >= FLOOR); // 992
  assert.ok(score('Populi', '<iframe src="https://marianfdl.populiweb.com/router/donate?donate_page_id=3&amp;embedded=1"></iframe>') >= FLOOR); // 5817
});

test('Populi: no tenant, no detection; the word alone stays under the floor', () => {
  assert.strictEqual(score('Populi', '<p>Vox populi: students voted on the new library hours.</p>'), 0);
  assert.ok(score('Populi', '<p>Log in at populiweb.com with your student email.</p>') < FLOOR);
});

// ------------------------------------------------------------------------------------------ Skyward
test('Skyward: the hosted Family Access link clears the floor (Wilton Simpson Technical College, 7088)', () => {
  const html = '<a href="https://skyward.iscorp.com/scripts/wsisa.dll/WService=wseduhernandocofl/seplog01.w?nopopup=true" target="_blank" rel="noopener noreferrer">Skyward Family Access</a>';
  assert.ok(score('Skyward Student Management', html) >= FLOOR);
});

test('Skyward: the English word is not the product', () => {
  assert.strictEqual(score('Skyward Student Management', '<img alt="Whitman graduates looking skyward in their caps and gowns." class="relative z-10" src="/images/global/large-promo/Commencement.jpg">'), 0); // 3248
});
