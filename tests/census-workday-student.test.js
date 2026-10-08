// tests/census-workday-student.test.js -- Workday Student is the SIS module of the Workday suite. The
// 2026-10-08 census audit found 1 of 6 floor-50 detections right: the rest were the word "workday" in
// prose, Workday Recruiting job boards and tenant logins that do not say which module a site runs. Only
// evidence that names the Student module counts now. All snippets are verbatim from cohort 140.
const { test } = require('node:test');
const assert = require('node:assert');
const { score, FLOOR } = require('./helpers/census-page.js');

test('Workday Student: the module named in prose clears the ledger floor (Northampton CC, 1522, audited right)', () => {
  const html = '<p>To check this, visit ‘View My Academic Progress’ under the ‘Academics’ section of Workday Student. Check to make sure none of the classes in your current schedule show in the ‘Unused Registration’ blue link on top.</p>';
  assert.ok(score('Workday Student', html) >= FLOOR);
});

test('Workday Student: link text, headings and URL slugs that name the module', () => {
  assert.ok(score('Workday Student', '<li><a href="https://workday.wustl.edu/student">Workday Student</a></li>') >= FLOOR); // 2404
  assert.ok(score('Workday Student', '<h3>Workday Student</h3>') >= FLOOR); // 2255
  assert.ok(score('Workday Student', '<li>Log into your WorkDay Student account</li>') >= FLOOR); // 2494
  assert.strictEqual(score('Workday Student', '<li class="tabs-button" role="listitem"><a href="student/workday_student/index.html">Workday</a></li>'), 40); // 1956: a slug alone
});

test('Workday Student: "workday" in prose is not the product', () => {
  const prose = {
    4103: '<p>The video reflects a typical nurse’s workday.</p>',
    2603: '<p>I ran workdays on Monday afternoons</p>',
    5057: '<p>Today will be considered a remote workday for non-essential staff.</p>',
  };
  for (const [id, html] of Object.entries(prose)) assert.strictEqual(score('Workday Student', html), 0, id);
});

test('Workday Student: a Workday tenant does not say which module it runs', () => {
  const tenants = {
    2648: '<a href="https://hcfl.wd1.myworkdayjobs.com/hcjobs">Employment</a>',
    1695: '<a href="https://wofford.wd5.myworkdayjobs.com/Wofford">Jobs</a>',
    3843: '<a href="https://wd108.myworkday.com/pcom/d/home.htmld">Workday</a>',
    4265: '<a href="https://wd501.myworkday.com/ensigncollege/login.htmld">Workday Login</a>',
  };
  for (const [id, html] of Object.entries(tenants)) assert.strictEqual(score('Workday Student', html), 0, id);
});

test('Workday Student: a catalog tenant named after the Workday integration is not the module (1522 program page)', () => {
  const coursedog = '<meta property="og:url" content="northampton_workday-catalog.coursedog.com"><img src="https://coursedog-images-public.s3.us-east-2.amazonaws.com/northampton_workday/logofull.png" class="img" alt="Northampton Community College">';
  assert.strictEqual(score('Workday Student', coursedog), 0);
});
