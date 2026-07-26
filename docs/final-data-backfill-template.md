# ROBOOPS Final Data Backfill Template

Use one flat Excel sheet named `Final Daily Records` for Apr, May, Jun, and Jul backfill.
Each row represents one final record for one plant and one date.

Required row grain:

```text
plant_code + report_date
```

Recommended date format:

```text
1 July 2026
```

For system upload, dates can also be stored as real Excel dates and exported as `yyyy-mm-dd`.

## Identification

| Column | Description |
| --- | --- |
| plant_code | One of `GIRMAPUR-1`, `GIRMAPUR-2`, `KEESARA`, `LAKADARAM-1`, `LAKADARAM-2` |
| report_date | Daily report date |
| status | Use `FINAL` for historical backfill |
| submitted_by | User or team name |
| remarks | Daily remarks |

## Target And Production

| Column | Description |
| --- | --- |
| target_mt | Daily target |
| production_mt | Total production MT |
| ob_soft_rock_mt | OB soft rock quantity |
| ob_hard_rock_mt | OB hard rock quantity |

## Product Mix Percentages

Enter product percentages. The app should calculate MT from `production_mt`.

| Column |
| --- |
| mix_pct_r_sand |
| mix_pct_20_mm |
| mix_pct_10_mm |
| mix_pct_p_sand |
| mix_pct_plaster_pro |
| mix_pct_robo_sand_plus |
| mix_pct_wmm |

## Dispatch

| Column |
| --- |
| dispatch_r_sand_mt |
| dispatch_20_mm_mt |
| dispatch_10_mm_mt |
| dispatch_p_sand_mt |
| dispatch_plaster_pro_mt |
| dispatch_robo_sand_plus_mt |
| dispatch_wmm_mt |

## Opening Stock

| Column |
| --- |
| opening_stock_r_sand_mt |
| opening_stock_20_mm_mt |
| opening_stock_10_mm_mt |
| opening_stock_p_sand_mt |
| opening_stock_plaster_pro_mt |
| opening_stock_robo_sand_plus_mt |
| opening_stock_wmm_mt |

## Stock Adjustments

| Column |
| --- |
| stock_adj_r_sand_mt |
| stock_adj_20_mm_mt |
| stock_adj_10_mm_mt |
| stock_adj_p_sand_mt |
| stock_adj_plaster_pro_mt |
| stock_adj_robo_sand_plus_mt |
| stock_adj_wmm_mt |
| stock_adjustment_comment |

Closing stock should be calculated by the app:

```text
opening stock + product mix MT - dispatch + stock adjustment
```

## Monthly Opening Book Stock

Enter these only on the first date of each month for each plant. The app should carry forward and calculate daily closing book stock.

| Column |
| --- |
| book_opening_r_sand_mt |
| book_opening_20_mm_mt |
| book_opening_10_mm_mt |
| book_opening_p_sand_mt |
| book_opening_plaster_pro_mt |
| book_opening_robo_sand_plus_mt |
| book_opening_wmm_mt |

## Equipment Hour Meters

Use decimal format such as `7.1`, `7.8`, `8.0`.

| Column |
| --- |
| jaw_hour_opening |
| jaw_hour_closing |
| cone_hour_opening |
| cone_hour_closing |
| vsi_hour_opening |
| vsi_hour_closing |

## Plant Hours

Use decimal hours in the template. The app can display hours as HH:MM.

| Column |
| --- |
| available_hours |
| production_hours |
| scheduled_stoppage_hours |

Loss hours should be entered by category:

| Column |
| --- |
| quarry_oversize_jams_hours |
| quarry_oversize_jams_comments |
| quarry_no_tippers_hours |
| quarry_no_tippers_comments |
| quarry_no_material_hours |
| quarry_no_material_comments |
| quarry_blasting_hours |
| quarry_blasting_comments |
| plant_breakdown_hours |
| plant_breakdown_comments |
| plant_scheduled_maintenance_hours |
| plant_scheduled_maintenance_comments |
| plant_idle_hours |
| plant_idle_comments |
| plant_other_hours |
| plant_other_comments |

## Electrical

Plant KWH/KVAH MF is fixed in the app by plant. Domestic MF is also fixed by plant.

| Column |
| --- |
| kwh_opening |
| kwh_closing |
| kvah_opening |
| kvah_closing |
| cmd |
| domestic_kwh_opening |
| domestic_kwh_closing |
| exclude_domestic_from_units_per_mt |

Power factor should be calculated by the app:

```text
actual KWH units / actual KVAH units
```

## Loader

For Keesara and Lakadaram plants, loader dispatch MT should be automatically set from total dispatch.

| Column |
| --- |
| loader_hour_opening |
| loader_hour_closing |
| loader_other_works_hours |
| loader_diesel_litres |
| loader_dispatch_mt |
| include_diesel_variance |

## COP Weekly Inputs

These are weekly inputs. Enter them on the first date of the applicable week for each plant; the app can carry them within the week.

| Column |
| --- |
| fixed_cost |
| raw_material_cost |
| rent_plant_cost |
| plant_maintenance_cost |
| spares_consumables_cost |
| wear_parts_cost |
| intercarting_expenses |

Frozen rates remain backend-managed:

| Rate | Backend source |
| --- | --- |
| Drilling and blasting | Plant group |
| Loading and transport | Plant group |
| Diesel | Plant group |
| Diesel variance | Plant group |
| OB soft rock | Plant group |
| OB hard rock | Plant group |
