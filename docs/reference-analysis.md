# Reference Mapping

The current implementation uses the provided GIR workbook, dashboard HTML and WRM PowerPoint only as references. The operating workflow is now daily data capture first; reports are outputs from validated database records.

- `Book stock`: canonical dates, plant code, production, product mix, dispatch mix and opening/closing stock.
- `Traget`: daily production target. The sheet name is intentionally preserved because that is how the workbook is named.
- `Hours meter`: Jaw, Cone and VSI hours plus TPH.
- `Plant report `: scheduled hours, non-productive hours, production hours, stoppage/loss hours, idle and breakdown buckets.
- `Electrical Readings`: kWh, kVAh, power factor, max demand and units/MT.
- `Loader -1`: loader dispatch, hours, TPH, diesel, litres/hour and litres/MT.
- WRM PPT reference: weekly report sequence is retained for generated decks: title, target vs actual, plant hours, loss hours, Jaw TPH, utilisation, VSI TPH, electricity, loader, commentary/action points, next-week target, thank-you.

Daily capture records are validated before final submission. Locked dashboard and PowerPoint generation consume `ReportSnapshot`; calculations are deterministic and AI is limited to commentary text.
