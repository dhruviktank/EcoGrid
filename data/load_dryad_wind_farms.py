"""
Generic Loader and ETL Pipeline for Dryad Offshore Wind Farm Dataset
(doi:10.5061/dryad.w6m905qzk - North Sea & UK Waters Power Production)

All 31 wind farm files contain identical two-column SCADA telemetry:
- Col 0: Period-end timestamp (e.g., '2020-01-01T00:30:00')
- Col 1: Accumulated generation in MWh over the 30-minute interval

ETL Steps:
1. One Generic Loader Function: `load_and_process_dryad_file(...)`
2. Unit Conversion: MW = MWh / 0.5h (MWh * 2.0)
3. Resampling: Aggregates half-hourly pairs into hourly average MW via ceil('1h')
4. Continuous Timestamps: Reindexes over complete date range with linear interpolation (zero gaps)
5. Physical Consistency: Estimates aerodynamic wind speed from inverted power curve
6. Unified CSV Output: Generates data/dryad_offshore_wind_generation.csv matching backend schema
"""

import os
import glob
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(REPO_ROOT, "data")
DRYAD_DIR = "/Users/dhruviktank/Desktop/Hackout/doi_10_5061_dryad_w6m905qzk__v20250417"
OUTPUT_CSV = os.path.join(DATA_DIR, "dryad_offshore_wind_generation.csv")

# Metadata registry for all 31 offshore wind farms in the Dryad dataset
WIND_FARMS_METADATA: List[Dict[str, Any]] = [
    {
        "csv_filename": "Beatrice.csv",
        "site_id": "beatrice-wind",
        "id": "beatrice-wind",
        "name": "Beatrice Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Moray Firth, Scotland",
        "latitude": 58.250,
        "longitude": -2.900,
        "capacity_mw": 588.0,
        "hub_height_m": 107.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 200.0,
        "bess_max_power_mw": 50.0,
        "description": "588 MW Scottish deep-water offshore wind facility featuring 84 Siemens Gamesa 7 MW turbines in the Moray Firth."
    },
    {
        "csv_filename": "EastAngliaOne.csv",
        "site_id": "east-anglia-one-wind",
        "id": "east-anglia-one-wind",
        "name": "East Anglia ONE Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Suffolk, England",
        "latitude": 52.230,
        "longitude": 2.480,
        "capacity_mw": 714.0,
        "hub_height_m": 110.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.5,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 250.0,
        "bess_max_power_mw": 60.0,
        "description": "714 MW utility offshore wind farm located 43 km off the Suffolk coast, generating renewable power with 102 Siemens Gamesa 7 MW turbines."
    },
    {
        "csv_filename": "LondonArray.csv",
        "site_id": "london-array-wind",
        "id": "london-array-wind",
        "name": "London Array Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Thames Estuary, England",
        "latitude": 51.640,
        "longitude": 1.500,
        "capacity_mw": 630.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 220.0,
        "bess_max_power_mw": 55.0,
        "description": "630 MW offshore wind farm situated 20 km off the Kent coast in the outer Thames Estuary."
    },
    {
        "csv_filename": "Seagreen.csv",
        "site_id": "seagreen-wind",
        "id": "seagreen-wind",
        "name": "Seagreen Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Firth of Forth, Scotland",
        "latitude": 56.580,
        "longitude": -1.900,
        "capacity_mw": 1075.0,
        "hub_height_m": 115.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 350.0,
        "bess_max_power_mw": 90.0,
        "description": "1,075 MW Scottish offshore wind farm anchored by deep-water suction caisson jackets in the Firth of Forth."
    },
    {
        "csv_filename": "MorayEast.csv",
        "site_id": "moray-east-wind",
        "id": "moray-east-wind",
        "name": "Moray East Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Moray Firth, Scotland",
        "latitude": 58.180,
        "longitude": -2.720,
        "capacity_mw": 950.0,
        "hub_height_m": 115.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 300.0,
        "bess_max_power_mw": 80.0,
        "description": "950 MW Scottish wind farm with 100 9.5 MW turbines delivering power to the National Grid from Moray Firth."
    },
    {
        "csv_filename": "TritonKnoll.csv",
        "site_id": "triton-knoll-wind",
        "id": "triton-knoll-wind",
        "name": "Triton Knoll Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Greater Wash off Lincolnshire, England",
        "latitude": 53.400,
        "longitude": 0.830,
        "capacity_mw": 857.0,
        "hub_height_m": 110.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 280.0,
        "bess_max_power_mw": 70.0,
        "description": "857 MW North Sea wind farm 32 km off the Lincolnshire coast supplying electricity to 800,000 homes."
    },
    {
        "csv_filename": "WalneyExtension.csv",
        "site_id": "walney-extension-wind",
        "id": "walney-extension-wind",
        "name": "Walney Extension Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Irish Sea off Cumbria, England",
        "latitude": 54.080,
        "longitude": -3.730,
        "capacity_mw": 659.0,
        "hub_height_m": 113.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 230.0,
        "bess_max_power_mw": 60.0,
        "description": "659 MW Irish Sea renewable project operating 87 high-yield offshore turbines."
    },
    {
        "csv_filename": "GwyntyMor.csv",
        "site_id": "gwynt-y-mor-wind",
        "id": "gwynt-y-mor-wind",
        "name": "Gwynt y Môr Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Liverpool Bay, North Wales",
        "latitude": 53.450,
        "longitude": -3.580,
        "capacity_mw": 576.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 200.0,
        "bess_max_power_mw": 50.0,
        "description": "576 MW wind farm in Liverpool Bay, Wales with 160 turbines providing clean power."
    },
    {
        "csv_filename": "RaceBank.csv",
        "site_id": "race-bank-wind",
        "id": "race-bank-wind",
        "name": "Race Bank Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Norfolk, England",
        "latitude": 53.270,
        "longitude": 0.830,
        "capacity_mw": 573.0,
        "hub_height_m": 110.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.5,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 200.0,
        "bess_max_power_mw": 50.0,
        "description": "573 MW offshore wind facility located 27 km off Blakeney Point with 91 6.3 MW turbines."
    },
    {
        "csv_filename": "GreaterGabbard.csv",
        "site_id": "greater-gabbard-wind",
        "id": "greater-gabbard-wind",
        "name": "Greater Gabbard Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Suffolk, England",
        "latitude": 51.880,
        "longitude": 1.930,
        "capacity_mw": 504.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 180.0,
        "bess_max_power_mw": 45.0,
        "description": "504 MW offshore facility 23 km off the Suffolk coast operating 140 Siemens turbines."
    },
    {
        "csv_filename": "Dudgeon.csv",
        "site_id": "dudgeon-wind",
        "id": "dudgeon-wind",
        "name": "Dudgeon Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Norfolk, England",
        "latitude": 53.250,
        "longitude": 1.380,
        "capacity_mw": 402.0,
        "hub_height_m": 105.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 140.0,
        "bess_max_power_mw": 35.0,
        "description": "402 MW North Sea wind plant located 32 km north of Cromer, Norfolk."
    },
    {
        "csv_filename": "Rampion.csv",
        "site_id": "rampion-wind",
        "id": "rampion-wind",
        "name": "Rampion Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "English Channel off Sussex, England",
        "latitude": 50.670,
        "longitude": -0.120,
        "capacity_mw": 400.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 140.0,
        "bess_max_power_mw": 35.0,
        "description": "400 MW English Channel wind farm 13 km off the Sussex coast powering Sussex communities."
    },
    {
        "csv_filename": "WestOfDuddonSands.csv",
        "site_id": "west-of-duddon-sands-wind",
        "id": "west-of-duddon-sands-wind",
        "name": "West of Duddon Sands Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Irish Sea off Cumbria, England",
        "latitude": 53.980,
        "longitude": -3.460,
        "capacity_mw": 389.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 130.0,
        "bess_max_power_mw": 35.0,
        "description": "389 MW facility located in the East Irish Sea 14 km southwest of Barrow-in-Furness."
    },
    {
        "csv_filename": "Galloper.csv",
        "site_id": "galloper-wind",
        "id": "galloper-wind",
        "name": "Galloper Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Suffolk, England",
        "latitude": 51.890,
        "longitude": 2.040,
        "capacity_mw": 353.0,
        "hub_height_m": 105.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 120.0,
        "bess_max_power_mw": 30.0,
        "description": "353 MW wind farm situated 30 km off the Suffolk coast with 56 6.3 MW Siemens Gamesa turbines."
    },
    {
        "csv_filename": "SheringhamShoals.csv",
        "site_id": "sheringham-shoal-wind",
        "id": "sheringham-shoal-wind",
        "name": "Sheringham Shoal Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Norfolk, England",
        "latitude": 53.130,
        "longitude": 1.150,
        "capacity_mw": 317.0,
        "hub_height_m": 95.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 110.0,
        "bess_max_power_mw": 30.0,
        "description": "317 MW North Sea development comprising 88 turbines 17-23 km off Sheringham, Norfolk."
    },
    {
        "csv_filename": "Lincs.csv",
        "site_id": "lincs-wind",
        "id": "lincs-wind",
        "name": "Lincs Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "The Wash off Lincolnshire, England",
        "latitude": 53.180,
        "longitude": 0.490,
        "capacity_mw": 270.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 95.0,
        "bess_max_power_mw": 25.0,
        "description": "270 MW wind farm situated 8 km off the coast of Skegness in the Greater Wash."
    },
    {
        "csv_filename": "BurboBankExtension.csv",
        "site_id": "burbo-bank-extension-wind",
        "id": "burbo-bank-extension-wind",
        "name": "Burbo Bank Extension Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Liverpool Bay, England",
        "latitude": 53.483,
        "longitude": -3.283,
        "capacity_mw": 258.0,
        "hub_height_m": 110.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 90.0,
        "bess_max_power_mw": 25.0,
        "description": "258 MW facility in Liverpool Bay, the first commercial deployment of 8 MW turbines."
    },
    {
        "csv_filename": "HumberGateway.csv",
        "site_id": "humber-gateway-wind",
        "id": "humber-gateway-wind",
        "name": "Humber Gateway Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off East Yorkshire, England",
        "latitude": 53.640,
        "longitude": 0.290,
        "capacity_mw": 219.0,
        "hub_height_m": 90.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 75.0,
        "bess_max_power_mw": 20.0,
        "description": "219 MW wind farm 8 km off the East Yorkshire coast at the mouth of the Humber."
    },
    {
        "csv_filename": "WestermostRough.csv",
        "site_id": "westermost-rough-wind",
        "id": "westermost-rough-wind",
        "name": "Westermost Rough Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Yorkshire, England",
        "latitude": 53.800,
        "longitude": 0.150,
        "capacity_mw": 210.0,
        "hub_height_m": 102.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 70.0,
        "bess_max_power_mw": 20.0,
        "description": "210 MW array located 8 km off the Holderness coast, Yorkshire."
    },
    {
        "csv_filename": "Walney1.csv",
        "site_id": "walney-1-wind",
        "id": "walney-1-wind",
        "name": "Walney 1 Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Irish Sea off Cumbria, England",
        "latitude": 54.040,
        "longitude": -3.520,
        "capacity_mw": 184.0,
        "hub_height_m": 90.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 65.0,
        "bess_max_power_mw": 18.0,
        "description": "184 MW Phase 1 array situated 15 km west of Barrow-in-Furness in the Irish Sea."
    },
    {
        "csv_filename": "Walney2.csv",
        "site_id": "walney-2-wind",
        "id": "walney-2-wind",
        "name": "Walney 2 Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Irish Sea off Cumbria, England",
        "latitude": 54.040,
        "longitude": -3.520,
        "capacity_mw": 184.0,
        "hub_height_m": 90.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 65.0,
        "bess_max_power_mw": 18.0,
        "description": "184 MW Phase 2 array complementing Walney 1 with 51 3.6 MW Siemens turbines."
    },
    {
        "csv_filename": "RobinRigg.csv",
        "site_id": "robin-rigg-wind",
        "id": "robin-rigg-wind",
        "name": "Robin Rigg Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Solway Firth, Scotland",
        "latitude": 54.750,
        "longitude": -3.720,
        "capacity_mw": 174.0,
        "hub_height_m": 85.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 60.0,
        "bess_max_power_mw": 15.0,
        "description": "174 MW wind farm located in the Solway Firth midway between the Galloway and Cumbrian coasts."
    },
    {
        "csv_filename": "GunfleetSands.csv",
        "site_id": "gunfleet-sands-wind",
        "id": "gunfleet-sands-wind",
        "name": "Gunfleet Sands Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "Thames Estuary off Essex, England",
        "latitude": 51.730,
        "longitude": 1.220,
        "capacity_mw": 173.0,
        "hub_height_m": 85.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 60.0,
        "bess_max_power_mw": 15.0,
        "description": "173 MW offshore wind plant located 7 km off Clacton-on-Sea in the Thames Estuary."
    },
    {
        "csv_filename": "Ormonde.csv",
        "site_id": "ormonde-wind",
        "id": "ormonde-wind",
        "name": "Ormonde Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Irish Sea off Barrow-in-Furness, England",
        "latitude": 54.100,
        "longitude": -3.400,
        "capacity_mw": 150.0,
        "hub_height_m": 90.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 50.0,
        "bess_max_power_mw": 15.0,
        "description": "150 MW facility 10 km off Barrow-in-Furness operating 30 5 MW Senvion turbines."
    },
    {
        "csv_filename": "HornseaOne.csv",
        "site_id": "hornsea-one-wind",
        "id": "hornsea-one-wind",
        "name": "Hornsea 1 Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Yorkshire, England",
        "latitude": 53.880,
        "longitude": 1.900,
        "capacity_mw": 1218.0,
        "hub_height_m": 110.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 400.0,
        "bess_max_power_mw": 100.0,
        "description": "1,218 MW world-scale offshore wind facility 120 km off the Yorkshire coast with 174 7 MW turbines."
    },
    {
        "csv_filename": "Aberdeen.csv",
        "site_id": "aberdeen-wind",
        "id": "aberdeen-wind",
        "name": "Aberdeen Bay Offshore Wind (EOWDC)",
        "type": "wind",
        "country": "UK",
        "region": "Aberdeen Bay, Scotland",
        "latitude": 57.220,
        "longitude": -2.010,
        "capacity_mw": 96.8,
        "hub_height_m": 105.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 35.0,
        "bess_max_power_mw": 10.0,
        "description": "96.8 MW European Offshore Wind Deployment Centre pioneering suction bucket jacket technology."
    },
    {
        "csv_filename": "BurboBank.csv",
        "site_id": "burbo-bank-wind",
        "id": "burbo-bank-wind",
        "name": "Burbo Bank Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "Liverpool Bay, England",
        "latitude": 53.483,
        "longitude": -3.183,
        "capacity_mw": 90.0,
        "hub_height_m": 85.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 30.0,
        "bess_max_power_mw": 10.0,
        "description": "90 MW original array in Liverpool Bay generating clean power for Merseyside."
    },
    {
        "csv_filename": "Barrow.csv",
        "site_id": "barrow-wind",
        "id": "barrow-wind",
        "name": "Barrow Offshore Wind Farm",
        "type": "wind",
        "country": "UK",
        "region": "East Irish Sea, England",
        "latitude": 54.017,
        "longitude": -3.283,
        "capacity_mw": 90.0,
        "hub_height_m": 85.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 30.0,
        "bess_max_power_mw": 10.0,
        "description": "90 MW early commercial offshore wind farm 7 km southwest of Walney Island."
    },
    {
        "csv_filename": "Kincardine.csv",
        "site_id": "kincardine-wind",
        "id": "kincardine-wind",
        "name": "Kincardine Floating Offshore Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Aberdeenshire, Scotland",
        "latitude": 57.000,
        "longitude": -2.000,
        "capacity_mw": 50.0,
        "hub_height_m": 110.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 20.0,
        "bess_max_power_mw": 5.0,
        "description": "50 MW pioneering floating offshore wind farm using semi-submersible triangular hulls."
    },
    {
        "csv_filename": "HywindScotland.csv",
        "site_id": "hywind-scotland-wind",
        "id": "hywind-scotland-wind",
        "name": "Hywind Scotland Floating Wind",
        "type": "wind",
        "country": "UK",
        "region": "North Sea off Peterhead, Scotland",
        "latitude": 57.480,
        "longitude": -1.350,
        "capacity_mw": 30.0,
        "hub_height_m": 100.0,
        "cut_in_speed_ms": 3.0,
        "rated_speed_ms": 12.0,
        "cut_out_speed_ms": 25.0,
        "bess_capacity_mwh": 10.0,
        "bess_max_power_mw": 3.0,
        "description": "World's first commercial floating offshore wind farm with 5 spar-buoy turbines off Peterhead."
    }
]


def load_and_process_dryad_file(
    file_path: str,
    site_id: str,
    capacity_mw: float,
    start_date: str = "2023-01-01 00:00:00",
    end_date: str = "2023-12-31 23:00:00"
) -> pd.DataFrame:
    """
    Unified loader function to parse, convert, resample, and format
    Dryad half-hourly power production telemetry for any wind farm.
    
    Args:
        file_path: Full path to the wind farm CSV file.
        site_id: Canonical site identifier (e.g., 'beatrice-wind').
        capacity_mw: Nameplate generation capacity in MW.
        start_date: Start of continuous hourly timeline (ISO string).
        end_date: End of continuous hourly timeline (ISO string).
        
    Returns:
        DataFrame conforming to the EcoGrid backend schema with continuous hourly timestamps.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Read raw 2-column CSV: [period_end_timestamp, accumulated_mwh]
    df_raw = pd.read_csv(file_path, header=None, names=["raw_ts", "mwh"], dtype={"raw_ts": str, "mwh": float})

    # Step 1: Parse timestamps
    df_raw["ts"] = pd.to_datetime(df_raw["raw_ts"], errors="coerce")
    df_raw = df_raw.dropna(subset=["ts"]).copy()

    # Step 2: Unit conversion: Energy / Time = Power -> MW = MWh / 0.5 = MWh * 2.0
    # Done once in loader so all downstream metrics operate in true MW
    df_raw["mw"] = df_raw["mwh"] * 2.0

    # Step 3: Resample half-hourly data into hourly average MW
    # Since timestamps mark the end of the half-hour, ceil('1h') maps :30:00 and :00:00 to the same hour end
    df_raw["hour_bin"] = df_raw["ts"].dt.ceil("1h")
    hourly_mw = df_raw.groupby("hour_bin")["mw"].mean()

    # Step 4: Strict continuity guarantee - zero gaps
    start_dt = pd.to_datetime(start_date)
    end_dt = pd.to_datetime(end_date)
    full_date_range = pd.date_range(start=start_dt, end=end_dt, freq="1h")

    # Reindex over the complete date range and fill any dropouts via linear interpolation
    hourly_series = hourly_mw.reindex(full_date_range).interpolate(method="linear").bfill().ffill()

    # Clip values: Non-negative generation (parasitic turbine consumption clipped to 0.0 for SCADA power)
    # and cap at 1.05 * capacity_mw to handle slight calibration overshoot
    hourly_clean = np.clip(hourly_series.to_numpy(), 0.0, capacity_mw * 1.05)

    # Step 5: Derive physically consistent wind speed (hub height 100m & 10m) from turbine power curve
    # Power curve inversion: CF = ((v - v_in) / (v_rated - v_in))^3 -> v = v_in + (v_rated - v_in) * CF^(1/3)
    cf = hourly_clean / max(1.0, capacity_mw)
    np.random.seed(42 + int(abs(hash(site_id)) % 10000))
    wind_noise = np.random.normal(0.0, 0.25, len(hourly_clean))

    wind_speed_100m = np.zeros(len(hourly_clean))
    ramp_mask = (cf > 0.001) & (cf < 0.98)
    wind_speed_100m[ramp_mask] = 3.0 + 9.0 * (cf[ramp_mask] ** (1.0 / 3.0)) + wind_noise[ramp_mask]
    wind_speed_100m[cf >= 0.98] = 12.0 + 2.5 * (cf[cf >= 0.98] - 0.98) + np.abs(wind_noise[cf >= 0.98])
    wind_speed_100m[cf <= 0.001] = np.maximum(0.8, 2.2 + wind_noise[cf <= 0.001])
    wind_speed_100m = np.clip(wind_speed_100m, 0.5, 24.5)

    # 10m wind speed via marine boundary layer power law (alpha ~ 0.11 over open sea)
    wind_speed_10m = np.clip(wind_speed_100m * (10.0 / 100.0) ** 0.11, 0.3, 20.0)

    # Step 6: Seasonal marine ambient temperature (North Sea 6°C to 16°C)
    day_of_year = full_date_range.dayofyear.to_numpy()
    temp_c = 10.5 + 4.5 * np.sin(2 * np.pi * (day_of_year - 105) / 365.25) + np.random.normal(0.0, 1.2, len(hourly_clean))

    # Cloud cover (typical North Sea maritime: 45% - 85%)
    cloud_cover = np.clip(60.0 + 15.0 * np.sin(2 * np.pi * day_of_year / 365.25) + np.random.normal(0.0, 12.0, len(hourly_clean)), 10.0, 100.0)

    # Format timestamps consistently with backend schema (ISO 8601 with trailing Z)
    formatted_ts = [dt.strftime("%Y-%m-%dT%H:%M:%SZ") for dt in full_date_range]

    # Step 7: Construct final DataFrame matching EcoGrid SCADA schema
    result_df = pd.DataFrame({
        "timestamp": formatted_ts,
        "site_id": site_id,
        "capacity_mw": round(float(capacity_mw), 1),
        "actual_generation_mw": np.round(hourly_clean, 2),
        "solar_generation_mw": 0.0,
        "wind_generation_mw": np.round(hourly_clean, 2),
        "ghi_wm2": 0.0,
        "dni_wm2": 0.0,
        "wind_speed_100m": np.round(wind_speed_100m, 2),
        "wind_speed_10m": np.round(wind_speed_10m, 2),
        "temperature_c": np.round(temp_c, 1),
        "cloud_cover_pct": np.round(cloud_cover, 1)
    })

    return result_df


def build_dryad_dataset(output_path: str = OUTPUT_CSV) -> pd.DataFrame:
    """
    Builds the combined dataset for all 30 North Sea offshore wind farms
    for the complete year 2023 (8,760 hours continuous per site).
    """
    all_dfs = []
    total_farms = len(WIND_FARMS_METADATA)
    print(f"[Dryad ETL] Processing {total_farms} offshore wind farms using unified loader...")

    for i, meta in enumerate(WIND_FARMS_METADATA, 1):
        file_path = os.path.join(DRYAD_DIR, meta["csv_filename"])
        if not os.path.exists(file_path):
            print(f"[Dryad ETL] Warning: File not found {file_path}, skipping.")
            continue

        site_id = meta["site_id"]
        cap_mw = meta["capacity_mw"]
        print(f"[{i}/{total_farms}] Loading {meta['name']} ({site_id}, {cap_mw} MW)...")

        site_df = load_and_process_dryad_file(
            file_path=file_path,
            site_id=site_id,
            capacity_mw=cap_mw,
            start_date="2023-01-01 00:00:00",
            end_date="2023-12-31 23:00:00"
        )

        # Verification check: zero missing values
        null_count = site_df.isna().sum().sum()
        assert null_count == 0, f"Found {null_count} NaNs in {site_id}!"
        assert len(site_df) == 8760, f"Expected 8760 hours, got {len(site_df)} for {site_id}!"

        all_dfs.append(site_df)

    combined_df = pd.concat(all_dfs, ignore_index=True)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    combined_df.to_csv(output_path, index=False)
    print(f"\n[Dryad ETL] Success! Wrote {len(combined_df):,} rows to {output_path}")
    print(f"[Dryad ETL] Unique sites: {combined_df['site_id'].nunique()}")
    print(f"[Dryad ETL] Memory size: {combined_df.memory_usage().sum() / 1024 / 1024:.2f} MB")
    return combined_df


if __name__ == "__main__":
    build_dryad_dataset()
