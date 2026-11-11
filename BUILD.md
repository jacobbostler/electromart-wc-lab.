# ElectroMart CCC App — what it does and how it was built

Notes on this project: what the app shows, how it is put together, and the
steps taken to build it. For the case itself see `case/ElectroMart_Case.md`;
for the lab's parts see `README.md`.

## What the app does

It reads ElectroMart's financial statements from CSV files and turns them into
working capital measures. Four sections:

**Days.** DIO, DSO and DPO and the cash conversion cycle, for Before and After
the changes, with the change between them. Each row prints its own formula.

| Measure | Formula | Before | After |
|---|---|---:|---:|
| DIO | Inventory / COGS x 365 | 73.00 | 36.50 |
| DSO | Receivables / revenue x 365 | 32.85 | 29.20 |
| DPO | Payables / COGS x 365 | 36.50 | 54.75 |
| Cash conversion cycle | DIO + DSO - DPO | 69.35 | 10.95 |

**Cash freed.** One row per lever, each showing the balance sheet change, the
cash that frees, and the same figure worked out from the days as a check:
inventory $600,000, receivables $100,000, payables $300,000, total $1,000,000.

**Where the cash went.** The bank line paydown ($800,000) and the rise in the
cash balance ($200,000).

**Move the levers.** Three sliders for DIO, DSO and DPO, with Set to Before and
Set to After buttons. Revenue and COGS stay at their Before values, so moving a
slider is a working capital change and nothing else. Each move updates the
cycle, the balances those days imply, the cash freed against Before, the
interest saved on the bank line, the days paid past net 30, and the annual cost
of skipping the 2% supplier discount.

It installs as a progressive web app and works with no connection.

## How it is put together

Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm packages,
and no requests to any other website. Five files at the repository root,
because GitHub Pages serves files exactly as they are:

| File | What it is |
|---|---|
| `index.html` | Structure: headings and empty tables |
| `styles.css` | Appearance, readable at 375 pixels wide |
| `ccc.js` | **All the finance math**, as pure functions |
| `app.js` | Plumbing: loads the CSVs, calls `ccc.js`, fills the tables |
| `sw.js` | Service worker: offline support |
| `manifest.webmanifest` | Lets the browser install the app |

The important decision is that `ccc.js` never touches the web page. Because it
only takes numbers and returns numbers, any formula can be checked from the
command line without a browser:

    node -e "const c=require('./ccc.js'); console.log(c.dio(1200000,6000000,365))"

Every figure was checked that way before each commit.

Other rules the code follows:

- Every number is read from `data/*.csv`. Nothing is typed into the code, so
  changing a CSV changes the app.
- The 365-day year, the 8% bank rate and the 2/10 net 30 terms come from
  `data/assumptions.csv`. The class slides use 360; this case uses 365.
- Nothing is rounded until it is displayed. Days show two decimals, dollars the
  nearest dollar, rates two decimals.
- Every path is relative, because the app is served from
  `https://<username>.github.io/<repository>/` and not from a domain root.
- The sliders use `step="any"` so Set to Before and Set to After restore exact
  values such as 36.50 instead of snapping to whole days.

## The steps

**Part A — by hand, no AI.** Filled in section 1 of the case worksheet: DIO,
DSO, DPO and the cycle, Before and After, on a calculator.

**Part B — the calculator.** Started a Claude Code session on the repository
and asked for a page reading `data/electromart.csv` and
`data/assumptions.csv` that shows the four measures for both periods plus the
cash freed by each lever. Then checked the output against the worksheet: all
six hand-calculated day counts matched the app exactly. Also verified one
figure independently on a calculator — the cash freed by cutting inventory,
(73.00 - 36.50) x 6,000,000 / 365 = $600,000 — which matched the drop in the
inventory balance.

**Part C — the levers.** Wrote a prompt asking for the three sliders and the
five things each move should show, plus the Set to Before and Set to After
buttons, with the math kept in `ccc.js` and checked in Node. Confirmed that Set
to After reproduces the worksheet cycle of 10.95 days and that the implied
balances land on the After balance sheet.

**Part D — installable and published.** Asked for the manifest and service
worker, then reviewed the changes in the Changes card before merging.

## Still to do

- [ ] Review the diff, click **Create PR**, and merge the pull request
- [ ] Turn on GitHub Pages: Settings, Pages, Deploy from a branch, `main`,
      `/ (root)`
- [ ] Open the published address and install the app
- [ ] Part E: use the levers to answer the memo questions
- [ ] Part F (optional): load another company's CSV from the device

After a merge, GitHub Pages can keep serving the old copy for up to 10 minutes.
If a change does not appear, wait and refresh.

## Checking it still works

Run the math against the data:

    node -e "
    const fs=require('fs'), c=require('./ccc.js');
    const st=c.parseStatements(fs.readFileSync('data/electromart.csv','utf8'));
    const a=c.parseAssumptions(fs.readFileSync('data/assumptions.csv','utf8'));
    const b=c.periodMetrics(st.before,a), f=c.periodMetrics(st.after,a);
    console.log('CCC', c.formatDays(b.ccc), '->', c.formatDays(f.ccc));
    console.log('freed', c.formatDollars(c.cashFreed(st.before,st.after).total));
    "

It should print a cycle of 69.35 going to 10.95 and $1,000,000 of cash freed.
Two further checks worth knowing: cash freed computed from the balance sheet
and cash freed computed from the days must agree exactly, and Set to Before
must free $0.
