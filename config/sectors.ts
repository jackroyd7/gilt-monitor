// Sector of each stock on our UK, German and French lists (GICS-style, simplified), for the
// sector-performance table. Listed as tickers per sector, then turned into symbol → sector.

const UK: Record<string, string> = {
  Energy: "SHEL BP.",
  Materials: "RIO GLEN AAL ANTO FRES CRDA MNDI",
  Industrials: "REL RR. BA. EXPN AHT BNZL DCC IMI ITRK RTO SMIN SPX WEIR MRO BAB HWDN DPLM RS1 HLMA IAG EZJ",
  "Consumer discretionary": "CPG ENT IHG JD. KGF MKS NXT PSN BKG BTRW TW. WTB BRBY GAW PSON",
  "Consumer staples": "ULVR DGE BATS IMB TSCO SBRY ABF RKT HLN CCH",
  "Health care": "AZN GSK SN. HIK",
  Financials: "HSBA LLOY BARC NWG STAN LSEG III PRU LGEN AV. ADM BEZ HSX PHNX STJ SDR ICG IGG MNG SMT PSH ALW",
  Technology: "SGE",
  Communication: "VOD BT.A AUTO RMV INF WPP AAF",
  Utilities: "NG. SSE CNA SVT UU.",
  "Real estate": "LAND SGRO UTG LMP",
};

const DE: Record<string, string> = {
  Technology: "SAP IFX AIXA NEM BC8 TMV WAF IOS JEN",
  Industrials: "SIE RHM DHL MTX ENR DTG G1A KGX HOT FRA KBX DUE KRN HLAG TRATON RENK HAG OHB STM BNR SIX2 LHA RAA",
  Financials: "ALV MUV2 DBK DB1 HNR1 CBK TLX PBB",
  "Consumer discretionary": "MBG BMW VOW3 P911 PAH3 CON ADS PUM ZAL BOSS SHA DHER TUI1 CWC",
  Materials: "BAS HEI EVK LXS WCH SDF SY1 1COV NDA SZG TKA FPE3",
  "Health care": "BAYN MRK SHL FRE FME QIA SRT3 AFX GXI EVT RDC",
  "Consumer staples": "BEI HEN3 HFG",
  Communication: "DTE UTDI FNTN G24 PSM RRTL EVD BVB",
  Utilities: "EOAN RWE",
  "Real estate": "VNA LEG TEG AT1 DWNI",
};

const FR: Record<string, string> = {
  "Consumer discretionary": "MC RMS KER ML RNO STLAP AC SW FR FRVIA SK TRI FDJU CDI",
  "Consumer staples": "OR BN RI CA RCO ITP BB",
  Energy: "TTE GTT VK",
  "Health care": "SAN EL ERF IPN BIM DIM VLA",
  Industrials: "AIR SU SAF DG HO LR ALO BOL BVI FGR GET EN SPIE NEX RXL ELIS TEP EDEN PLX QDT DBG AM AF ADP AYV SGO",
  Materials: "AI AKE ERA NK VRLA VCT",
  Financials: "BNP CS ACA GLE AMUN SCR COFA RF MF",
  Technology: "CAP DSY STMPA SOP WLN SOI",
  Communication: "ORA PUB VIV TFI UBI IPS",
  Utilities: "ENGI VIE RUI",
  "Real estate": "URW COV GFC LI ICAD MERY",
};

const build = (exchange: string, map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).flatMap(([sector, tickers]) => tickers.split(/\s+/).map((t) => [`${exchange}:${t}`, sector])));

/** "LSE:SHEL" → "Energy". */
export const SECTOR_OF: Record<string, string> = { ...build("LSE", UK), ...build("XETR", DE), ...build("EURONEXT", FR) };

/** Markets in the sector-performance dropdown. */
export const SECTOR_MARKETS = [
  { id: "us", label: "US · sector ETFs (live)", tv: "US sectors" },
  { id: "eu", label: "Europe · STOXX 600 sector ETFs (live)", tv: "Europe sectors" },
  { id: "uk", label: "UK · FTSE 100 by sector", group: "UK stocks" },
  { id: "de", label: "Germany · large caps by sector", group: "German stocks" },
  { id: "fr", label: "France · large caps by sector", group: "French stocks" },
] as const;
