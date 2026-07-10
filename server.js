/**
 * CLIP mock — single service
 * --------------------------------------------------------------
 * Stands in for the California Laboratory Intake Portal (CLIP).
 * Serves BOTH:
 *   - the portal UI  →  GET /            (clip-portal.html)
 *   - the data API   →  GET /api/v1/results   (JSON for Salesforce)
 * One in-memory dataset feeds both. No database needed.
 *
 * Local:  node server.js   →  http://localhost:8088
 * Render: set Start Command to `node server.js` (PORT is provided)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

/* ----------------------- in-memory data ----------------------- */
const REFS = {
  "Hexavalent Chromium": { code:"1325", method:"EPA 218.6", unit:"µg/L", mcl:10,    dlr:0.03 },
  "Arsenic":             { code:"1005", method:"EPA 200.8", unit:"µg/L", mcl:10,    dlr:2    },
  "Nitrate (as N)":      { code:"1040", method:"EPA 300.0", unit:"mg/L", mcl:10,    dlr:0.4  },
  "1,2,3-TCP":           { code:"2931", method:"EPA 504.1", unit:"µg/L", mcl:0.005, dlr:0.005},
  "Perchlorate":         { code:"1645", method:"EPA 314.0", unit:"µg/L", mcl:6,     dlr:2    },
  "Gross Alpha":         { code:"4000", method:"EPA 900.0", unit:"pCi/L",mcl:15,    dlr:3    }
};
const LABS = [
  { id:"2783", name:"Monterey Bay Analytical Services" },
  { id:"1546", name:"BSK Associates" },
  { id:"2616", name:"Eurofins Eaton Analytical" },
  { id:"1186", name:"Babcock Laboratories" }
];
const SYSTEMS = [
  { ps:"CA3610001", name:"Big Valley Water District" },
  { ps:"CA3710007", name:"Hands Off Mutual Water Co." },
  { ps:"CA1910115", name:"Engaged Water Company" },
  { ps:"CA5510020", name:"Cedar Ridge CSD" },
  { ps:"CA3010044", name:"Summit Mesa Utility" }
];
const SEED = [
  [0,"Hexavalent Chromium",9.1,38,0,false],[0,"Hexavalent Chromium",13.8,12,0,true],
  [1,"Arsenic",6.3,44,2,false],
  [1,"Hexavalent Chromium",7.9,25,0,false],
  [2,"Perchlorate",3.0,51,3,false],[3,"1,2,3-TCP",0.0049,33,2,false],
  [3,"Gross Alpha",9.4,60,3,false],[4,"Arsenic",12.1,18,2,false],
  [4,"Hexavalent Chromium",4.6,41,0,false]
];
const iso = d => d.toISOString().slice(0,19)+"Z";
let SEQ = 480231;
const DATA = SEED.map((s,i)=>{
  const [si,analyte,result,daysAgo,li,conf]=s;
  const sys=SYSTEMS[si], ref=REFS[analyte], lab=LABS[li];
  const collected=new Date(Date.now()-daysAgo*864e5);
  const analyzed =new Date(collected.getTime()+3*864e5+36e5*((i%5)+1));
  const submitted=new Date(analyzed.getTime()+864e5+36e5*((i%4)+2));
  return {
    sampleId:"SMP-"+(SEQ+=7), psCode:sys.ps, sourceCode:"0"+((si%3)+1), waterSystemName:sys.name,
    analyte, analyteCode:ref.code, sampleType:conf?"Confirmation":"Routine",
    result, units:ref.unit, referenceValue:ref.mcl, dlr:ref.dlr,
    analyticalMethod:ref.method, labId:lab.id, labName:lab.name,
    collectedDateTime:iso(collected), analyzedDateTime:iso(analyzed),
    submittedDateTime:iso(submitted), exceeds:result>ref.mcl
  };
});

function query({psCode,analyte,status}){
  let rows=DATA.slice();
  if(psCode)  rows=rows.filter(r=>r.psCode===psCode);
  if(analyte) rows=rows.filter(r=>r.analyteCode===analyte||r.analyte===analyte);
  if(status==="ex") rows=rows.filter(r=>r.exceeds);
  if(status==="ok") rows=rows.filter(r=>!r.exceeds);
  return rows.map(({exceeds,...keep})=>keep);
}

/* ----------------------- server ----------------------- */
const PORT = process.env.PORT || 8088;
const PORTAL = path.join(__dirname, "clip-portal-v2.html");

http.createServer((req,res)=>{
  const u = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin","*"); // allow Salesforce / browser

  // --- API ---
  if (u.pathname === "/api/v1/results") {
    const records = query({
      psCode:u.searchParams.get("psCode"),
      analyte:u.searchParams.get("analyte"),
      status:u.searchParams.get("status")
    });
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({
      status:"success", source:"CLIP",
      format:"CA_SDWIS_Lab_Analytical_Data",
      count:records.length, retrievedAt:iso(new Date()), records
    }, null, 2));
    return;
  }

  // --- health check (handy for uptime pingers) ---
  if (u.pathname === "/health") {
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({status:"up", records:DATA.length}));
    return;
  }

  // --- portal UI (root) ---
  if (u.pathname === "/" || u.pathname === "/portal" || u.pathname === "/index.html") {
    fs.readFile(PORTAL, (err,buf)=>{
      if(err){res.statusCode=500;res.end("Portal file missing");return;}
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.end(buf);
    });
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify({status:"error", message:"Not found. Try / or /api/v1/results"}));
}).listen(PORT, ()=>console.log("CLIP mock running on :"+PORT));
