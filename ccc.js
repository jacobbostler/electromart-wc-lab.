/* ccc.js — the finance math for the ElectroMart app.
 *
 * Every function here is "pure": it takes numbers in and gives numbers back,
 * and it never touches the web page. That means you can check any of it from
 * the command line with Node, for example:
 *
 *   node -e "const c=require('./ccc.js'); console.log(c.dio(1200000,6000000,365))"
 *
 * Conventions for this lab (see CLAUDE.md):
 *   DIO = Inventory / COGS x 365
 *   DSO = Accounts receivable / Revenue x 365
 *   DPO = Accounts payable / COGS x 365
 *   Cash conversion cycle = DIO + DSO - DPO
 * Nothing is rounded here. Rounding happens only when a number is formatted
 * for display.
 */
'use strict';

/* ---------- reading the CSV files ---------- */

/* Split CSV text into rows of trimmed cells. The lab's CSV files have no
 * quoted fields, so a plain split on commas is enough. */
function splitRows(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length > 0; })
    .map(function (line) {
      return line.split(',').map(function (cell) { return cell.trim(); });
    });
}

/* data/electromart.csv -> { before: {...}, after: {...}, sections: {...} }
 *
 * Each row names a line item and gives its Before and After amount. The
 * `section` column says whether the item is on the income statement, is an
 * asset, or is a liability or equity. */
function parseStatements(text) {
  var rows = splitRows(text);
  if (rows.length < 2) throw new Error('electromart.csv has no data rows');

  var head = rows[0];
  var iSection = head.indexOf('section');
  var iItem = head.indexOf('item');
  var iBefore = head.indexOf('before');
  var iAfter = head.indexOf('after');
  if (iSection < 0 || iItem < 0 || iBefore < 0 || iAfter < 0) {
    throw new Error('electromart.csv needs section, item, before and after columns');
  }

  var out = { before: {}, after: {}, sections: {} };
  rows.slice(1).forEach(function (row) {
    var item = row[iItem];
    out.before[item] = Number(row[iBefore]);
    out.after[item] = Number(row[iAfter]);
    out.sections[item] = row[iSection];
  });
  return out;
}

/* data/assumptions.csv -> { days_in_year: 365, bank_rate: 0.08, ... } */
function parseAssumptions(text) {
  var rows = splitRows(text);
  if (rows.length < 2) throw new Error('assumptions.csv has no data rows');

  var head = rows[0];
  var iName = head.indexOf('assumption');
  var iValue = head.indexOf('value');
  if (iName < 0 || iValue < 0) {
    throw new Error('assumptions.csv needs assumption and value columns');
  }

  var out = {};
  rows.slice(1).forEach(function (row) {
    out[row[iName]] = Number(row[iValue]);
  });
  return out;
}

/* Pull only the items a section holds, e.g. every asset. */
function itemsInSection(statements, section) {
  return Object.keys(statements.sections).filter(function (item) {
    return statements.sections[item] === section;
  });
}

/* ---------- the day counts ---------- */

/* Days a balance represents, given the yearly flow that runs through it. */
function daysOutstanding(balance, annualFlow, daysInYear) {
  if (!annualFlow) return 0;
  return (balance / annualFlow) * daysInYear;
}

/* Days inventory outstanding: how long goods sit on the shelf. */
function dio(inventory, cogs, daysInYear) {
  return daysOutstanding(inventory, cogs, daysInYear);
}

/* Days sales outstanding: how long customers take to pay. */
function dso(accountsReceivable, revenue, daysInYear) {
  return daysOutstanding(accountsReceivable, revenue, daysInYear);
}

/* Days payable outstanding: how long ElectroMart takes to pay suppliers. */
function dpo(accountsPayable, cogs, daysInYear) {
  return daysOutstanding(accountsPayable, cogs, daysInYear);
}

/* Cash conversion cycle: days a dollar is tied up in operations. */
function cashConversionCycle(dioDays, dsoDays, dpoDays) {
  return dioDays + dsoDays - dpoDays;
}

/* All four numbers for one period (a `before` or `after` object). */
function periodMetrics(period, assumptions) {
  var daysInYear = assumptions.days_in_year;
  var dioDays = dio(period.inventory, period.cogs, daysInYear);
  var dsoDays = dso(period.accounts_receivable, period.revenue, daysInYear);
  var dpoDays = dpo(period.accounts_payable, period.cogs, daysInYear);
  return {
    dio: dioDays,
    dso: dsoDays,
    dpo: dpoDays,
    ccc: cashConversionCycle(dioDays, dsoDays, dpoDays)
  };
}

/* ---------- cash freed by each lever ---------- */

/* The dollars a change in days is worth: days x the yearly flow / 365. */
function cashFromDays(daysChanged, annualFlow, daysInYear) {
  return (daysChanged * annualFlow) / daysInYear;
}

/* Cash freed, read straight off the balance sheet.
 * A drop in an asset frees cash; a rise in accounts payable frees cash. */
function cashFreed(before, after) {
  var inventory = before.inventory - after.inventory;
  var receivables = before.accounts_receivable - after.accounts_receivable;
  var payables = after.accounts_payable - before.accounts_payable;
  return {
    inventory: inventory,
    receivables: receivables,
    payables: payables,
    total: inventory + receivables + payables
  };
}

/* The same three numbers worked out from the days instead of the balances.
 * They should match cashFreed() to the penny — that is the check README
 * Part B asks you to do with a calculator. */
function cashFreedFromDays(before, after, assumptions) {
  var d = assumptions.days_in_year;
  var b = periodMetrics(before, assumptions);
  var a = periodMetrics(after, assumptions);
  var inventory = cashFromDays(b.dio - a.dio, before.cogs, d);
  var receivables = cashFromDays(b.dso - a.dso, before.revenue, d);
  var payables = cashFromDays(a.dpo - b.dpo, before.cogs, d);
  return {
    inventory: inventory,
    receivables: receivables,
    payables: payables,
    total: inventory + receivables + payables
  };
}

/* ---------- the levers ---------- */

/* The balance a number of days implies, at a given yearly flow.
 * This is cashFromDays() read the other way round. */
function balanceFromDays(days, annualFlow, daysInYear) {
  return (days * annualFlow) / daysInYear;
}

/* The three balances a set of days implies. Revenue and COGS are held at
 * their Before values, because a lever is a working capital choice: it does
 * not change what ElectroMart sells or what its goods cost. */
function impliedBalances(days, before, assumptions) {
  var d = assumptions.days_in_year;
  return {
    inventory: balanceFromDays(days.dio, before.cogs, d),
    receivables: balanceFromDays(days.dso, before.revenue, d),
    payables: balanceFromDays(days.dpo, before.cogs, d)
  };
}

/* Cash freed by the levers, measured against the Before balance sheet.
 * Assets falling frees cash; payables rising frees cash. A negative number
 * means ElectroMart ties up more cash than it did before. */
function cashFreedByLevers(days, before, assumptions) {
  var balances = impliedBalances(days, before, assumptions);
  var inventory = before.inventory - balances.inventory;
  var receivables = before.accounts_receivable - balances.receivables;
  var payables = balances.payables - before.accounts_payable;
  return {
    balances: balances,
    inventory: inventory,
    receivables: receivables,
    payables: payables,
    total: inventory + receivables + payables
  };
}

/* Interest saved in a year if every freed dollar pays down the bank line.
 * Only the line's Before balance can be paid off, so the saving is capped
 * there. If cash freed is negative ElectroMart has to borrow more, and the
 * extra interest comes back as a negative saving. */
function interestSaved(cashFreedTotal, bankLineBefore, bankRate) {
  return Math.min(cashFreedTotal, bankLineBefore) * bankRate;
}

/* Days ElectroMart pays past the net-30 due date. Never below zero: paying
 * early is not negative lateness. */
function daysPastDue(dpoDays, netDays) {
  return Math.max(0, dpoDays - netDays);
}

/* Does ElectroMart take the 2/10 discount, and if not, what does skipping it
 * cost on a nominal annual basis?
 *
 *   cost = d / (1 - d) x 365 / (days paid - discount days)
 *
 * Paying within the discount period means taking the discount, so there is
 * no cost of skipping to report. */
function discountDecision(dpoDays, assumptions) {
  var rate = assumptions.supplier_discount;
  var discountDays = assumptions.discount_days;
  if (dpoDays <= discountDays) {
    return { takesDiscount: true, costOfSkipping: null };
  }
  var cost = (rate / (1 - rate)) *
             (assumptions.days_in_year / (dpoDays - discountDays));
  return { takesDiscount: false, costOfSkipping: cost };
}

/* Everything the lever panel needs, for one set of slider positions. */
function leverSummary(days, before, assumptions) {
  var freed = cashFreedByLevers(days, before, assumptions);
  return {
    days: {
      dio: days.dio,
      dso: days.dso,
      dpo: days.dpo,
      ccc: cashConversionCycle(days.dio, days.dso, days.dpo)
    },
    balances: freed.balances,
    freed: freed,
    interestSaved: interestSaved(freed.total, before.notes_payable, assumptions.bank_rate),
    daysPastDue: daysPastDue(days.dpo, assumptions.net_days),
    discount: discountDecision(days.dpo, assumptions)
  };
}

/* ---------- formatting ---------- */

function formatDays(value) {
  return value.toFixed(2);
}

function formatDollars(value) {
  var rounded = Math.round(value);
  var text = Math.abs(rounded).toLocaleString('en-US');
  return (rounded < 0 ? '-$' : '$') + text;
}

function formatPercent(rate) {
  return (rate * 100).toFixed(2) + '%';
}

/* Make the functions available to both the browser and Node. */
var api = {
  splitRows: splitRows,
  parseStatements: parseStatements,
  parseAssumptions: parseAssumptions,
  itemsInSection: itemsInSection,
  daysOutstanding: daysOutstanding,
  dio: dio,
  dso: dso,
  dpo: dpo,
  cashConversionCycle: cashConversionCycle,
  periodMetrics: periodMetrics,
  cashFromDays: cashFromDays,
  cashFreed: cashFreed,
  cashFreedFromDays: cashFreedFromDays,
  balanceFromDays: balanceFromDays,
  impliedBalances: impliedBalances,
  cashFreedByLevers: cashFreedByLevers,
  interestSaved: interestSaved,
  daysPastDue: daysPastDue,
  discountDecision: discountDecision,
  leverSummary: leverSummary,
  formatDays: formatDays,
  formatDollars: formatDollars,
  formatPercent: formatPercent
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CCC = api;
}
