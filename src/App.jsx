import React, { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const STORAGE_KEY = "ffl-data-v1";

const defaultSettings = {
  leagueName: "League Hub",
  commissioner: { name: "Jacob Tarter", email: "", team: "Straightest Man on Earth", passwordHash: null },
  rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 8 },
  scoring: "ESPN Redraft Default",
  seasonYear: new Date().getFullYear(),
  weeks: 13
};

const seedTeams = [
  { name: "Straightest Man on Earth", manager: "Jacob Tarter (Commissioner)" },
  { name: "Bust Down TD Perfect Timing", manager: "Avi Allen" },
  { name: "Wavy Gang", manager: "Joseph Counts" },
  { name: "Henry Ruggs Driving School", manager: "Ethan Winters" },
  { name: "EEL", manager: "Lee Bennett" },
  { name: "The Canman", manager: "Justin Montgomery" },
  { name: "Nacua Matata", manager: "Nick Blum" },
  { name: "Reigning Champs", manager: "Robert Goldsberry" },
  { name: "WAYMO SZN", manager: "John Martin" }
];

const starterPlayers = [
  { id: "p1", name: "Patrick Mahomes", pos: "QB", nfl: "KC", projected: 365, adp: 10, rank: 6, bye: 10 },
  { id: "p2", name: "Jalen Hurts", pos: "QB", nfl: "PHI", projected: 355, adp: 15, rank: 12, bye: 5 },
  { id: "p3", name: "Josh Allen", pos: "QB", nfl: "BUF", projected: 360, adp: 12, rank: 8, bye: 13 },
  { id: "p4", name: "Christian McCaffrey", pos: "RB", nfl: "SF", projected: 330, adp: 1, rank: 1, bye: 9 },
  { id: "p5", name: "Bijan Robinson", pos: "RB", nfl: "ATL", projected: 280, adp: 5, rank: 5, bye: 11 },
  { id: "p6", name: "Saquon Barkley", pos: "RB", nfl: "PHI", projected: 265, adp: 18, rank: 18, bye: 5 },
  { id: "p7", name: "Justin Jefferson", pos: "WR", nfl: "MIN", projected: 300, adp: 2, rank: 2, bye: 6 },
  { id: "p8", name: "CeeDee Lamb", pos: "WR", nfl: "DAL", projected: 290, adp: 4, rank: 4, bye: 7 },
  { id: "p9", name: "Ja'Marr Chase", pos: "WR", nfl: "CIN", projected: 285, adp: 3, rank: 3, bye: 12 },
  { id: "p10", name: "Travis Kelce", pos: "TE", nfl: "KC", projected: 230, adp: 22, rank: 22, bye: 10 },
  { id: "p11", name: "Sam LaPorta", pos: "TE", nfl: "DET", projected: 215, adp: 28, rank: 28, bye: 5 },
  { id: "p12", name: "49ers D/ST", pos: "DST", nfl: "SF", projected: 145, adp: 120, rank: 120, bye: 9 },
  { id: "p13", name: "Ravens D/ST", pos: "DST", nfl: "BAL", projected: 140, adp: 130, rank: 130, bye: 14 },
  { id: "p14", name: "Justin Tucker", pos: "K", nfl: "BAL", projected: 150, adp: 140, rank: 140, bye: 14 },
  { id: "p15", name: "Evan McPherson", pos: "K", nfl: "CIN", projected: 145, adp: 150, rank: 150, bye: 12 }
];

function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
function hashLite(s){ if(!s) return null; var h=0; for(var i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return String(h); }
function formatNum(n){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2}); }

function cloudDefaults(){ return { enabled:false, supabaseUrl:"", anonKey:"", table:"leagues", leagueId:"main", commishWrite:true, lastPulled:0 }; }

function newEmptyRoster(slots){ return { QB:[], RB:[], WR:[], TE:[], FLEX:[], DST:[], K:[], BENCH:[], _limits: deepClone(slots) }; }

function seedLeague(){
  const teams = seedTeams.map(function(t,i){ return { id:"t"+(i+1), name:t.name, manager:t.manager, roster:newEmptyRoster(defaultSettings.rosterSlots), wins:0, losses:0, pointsFor:0, pointsAgainst:0 }; });
  return { settings: defaultSettings, ui:{commishUnlocked:false, cloud: cloudDefaults()}, teams: teams, players: starterPlayers, schedule: [], playoffs: null, champions: [], news:{posts:[]}, feed:{posts:[]}, weeklyRecaps: [], history:{franchises:[],seasons:[],matches:[]}, tradeBlock:[] };
}

function loadLeague(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return seedLeague(); const data=JSON.parse(raw); if(!data.history) data.history={franchises:[],seasons:[],matches:[]}; if(!data.feed) data.feed={posts:[]}; if(!data.ui) data.ui={commishUnlocked:false}; if(!data.ui.cloud) data.ui.cloud=cloudDefaults(); if(!data.tradeBlock) data.tradeBlock=[]; ensureFranchises(data); return data; } catch { return seedLeague(); } }
function saveLeague(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function ensureFranchises(state){ state.history=state.history||{franchises:[],seasons:[],matches:[]}; for(const t of state.teams){ if(!state.history.franchises.some(function(f){ return f.currentTeamId===t.id; })){ const fid='f'+t.id; state.history.franchises.push({id:fid,name:t.name,currentTeamId:t.id,active:true}); } } }
function franchiseById(state,fid){ return state.history&&state.history.franchises.find(function(f){ return f.id===fid; }); }
function franchiseByTeamId(state,tid){ return state.history&&state.history.franchises.find(function(f){ return f.currentTeamId===tid; }); }
function franchiseName(state,fid){ const f=franchiseById(state,fid); return f?f.name:"Unknown"; }

function computeHistoryStats(state){
  const h=state.history||{franchises:[],seasons:[],matches:[]};
  const stats={};
  function ensure(fid){ if(!stats[fid]) stats[fid]={fid:fid,name:franchiseName(state,fid),seasons:0,wins:0,losses:0,finishes:[],championships:0,playoffApps:0,top3:0,top5:0,opponents:{}}; return stats[fid]; }
  for(const f of h.franchises||[]) ensure(f.id);
  for(const s of h.seasons||[]){ for(const e of s.entries||[]){ const st=ensure(e.franchiseId); st.seasons+=1; st.wins+=e.wins||0; st.losses+=e.losses||0; if(typeof e.finish==='number'){ st.finishes.push({year:s.year,finish:e.finish}); if(e.finish===1) st.championships+=1; if(e.finish<=4) st.playoffApps+=1; if(e.finish<=3) st.top3+=1; if(e.finish<=5) st.top5+=1; } } }
  for(const m of h.matches||[]){ if(!m||!m.homeFranchiseId||!m.awayFranchiseId) continue; const a=ensure(m.homeFranchiseId), b=ensure(m.awayFranchiseId); if(m.homeScore===m.awayScore) continue; const aWin=(m.homeScore||0)>(m.awayScore||0); if(!a.opponents[m.awayFranchiseId]) a.opponents[m.awayFranchiseId]={wins:0,losses:0}; if(!b.opponents[m.homeFranchiseId]) b.opponents[m.homeFranchiseId]={wins:0,losses:0}; if(aWin){ a.opponents[m.awayFranchiseId].wins++; b.opponents[m.homeFranchiseId].losses++; } else { a.opponents[m.awayFranchiseId].losses++; b.opponents[m.homeFranchiseId].wins++; } }
  for(const t of state.teams){ const f=franchiseByTeamId(state,t.id); if(!f) continue; const st=ensure(f.id); st.seasons+=1; st.wins+=t.wins||0; st.losses+=t.losses||0; }
  for(const w of state.schedule||[]){ for(const g of (w.games||[])){ if(!g.final) continue; const fh=franchiseByTeamId(state,g.home), fa=franchiseByTeamId(state,g.away); if(!fh||!fa) continue; if(g.homeScore===g.awayScore) continue; const ah=ensure(fh.id), aa=ensure(fa.id); const hWin=(g.homeScore||0)>(g.awayScore||0); if(!ah.opponents[fa.id]) ah.opponents[fa.id]={wins:0,losses:0}; if(!aa.opponents[fh.id]) aa.opponents[fh.id]={wins:0,losses:0}; if(hWin){ ah.opponents[fa.id].wins++; aa.opponents[fh.id].losses++; } else { ah.opponents[fa.id].losses++; aa.opponents[fh.id].wins++; } } }
  const out=Object.values(stats).map(function(st){ const total=st.wins+st.losses; const winPct=total>0?st.wins/total:0; var easiest=null,toughest=null; for(const oppId in st.opponents){ const rec=st.opponents[oppId]; const g=rec.wins+rec.losses; if(g===0) continue; const pct=rec.wins/g; const item={id:oppId,pct:pct,games:g}; if(!easiest||pct>easiest.pct) easiest=item; if(!toughest||pct<toughest.pct) toughest=item; } return {fid:st.fid,name:st.name,seasons:st.seasons,wins:st.wins,losses:st.losses,championships:st.championships,playoffApps:st.playoffApps,top3:st.top3,top5:st.top5,winPct:winPct,totalMatchups:total,easiest:easiest,toughest:toughest}; }).sort(function(a,b){ return b.championships-a.championships || b.winPct-a.winPct || b.seasons-a.seasons || a.name.localeCompare(b.name); });
  return out;
}

function getFranchiseFinishes(state,fid){ const arr=[]; for(const s of (state.history&&state.history.seasons||[])){ const e=(s.entries||[]).find(function(x){ return x.franchiseId===fid; }); if(e&&typeof e.finish==='number') arr.push({year:s.year,finish:e.finish}); } arr.sort(function(a,b){ return a.year-b.year; }); return arr; }

const Card=function(p){ return (<div className={"rounded-2xl border border-emerald-100/60 bg-white/90 shadow-md shadow-emerald-100/50 "+(p.className||"")}>{p.children}</div>); };
const CardHeader=function(p){ return (<div className="p-4 border-b border-gray-100 bg-gradient-to-r from-white to-emerald-50/30"><div className="flex items-center gap-2"><span role="img" aria-label="football">FB</span><h3 className="text-xl font-semibold">{p.title}</h3></div>{p.sub?<p className="text-sm text-gray-600 mt-1">{p.sub}</p>:null}</div>); };
const CardBody=function(p){ return (<div className={"p-4 "+(p.className||"")}>{p.children}</div>); };
const Button=function(p){ return (<button type={p.type||"button"} onClick={p.onClick} className={"px-4 py-2 rounded-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 active:scale-[.99] transition text-sm "+(p.className||"")}>{p.children}</button>); };
const PrimaryButton=function(p){ return (<button type={p.type||"button"} onClick={p.onClick} className={"px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:brightness-110 active:scale-[.99] transition text-sm shadow-sm "+(p.className||"")}>{p.children}</button>); };
const Input=function(props){ return (<input {...props} className={"w-full px-3 py-2 rounded-xl border border-gray-300 text-sm "+(props.className||"")} />); };
const Select=function(props){ return (<select {...props} className={"w-full px-3 py-2 rounded-xl border border-gray-300 text-sm bg-white "+(props.className||"")}>{props.children}</select>); };
const Tag=function(p){ return (<span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{p.children}</span>); };

const TABS=[
  {id:"dashboard",label:"Dashboard"},
  {id:"teams",label:"Teams & Rosters"},
  {id:"power",label:"Power Rankings"},
  {id:"previews",label:"Matchup Previews"},
  {id:"playoffs",label:"Playoffs"},
  {id:"trade",label:"Trade Analyzer"},
  {id:"free",label:"Free Agents"},
  {id:"champions",label:"Past Champions"},
  {id:"recap",label:"Weekly Recap (AI)"},
  {id:"feed",label:"League Feed"},
  {id:"path",label:"Strength & Playoffs"},
  {id:"tradeboard",label:"Trade Block"},
  {id:"awards",label:"Awards"},
  {id:"rivalry",label:"Rivalry"},
  {id:"history",label:"League History"},
  {id:"commish",label:"Commissioner"}
];

export default function FantasyLeagueHub(){
  const [state,setState]=useState(loadLeague());
  const [tab,setTab]=useState("dashboard");
  useEffect(function(){ saveLeague(state); },[state]);
  return (
    <div className="min-h-screen relative bg-gradient-to-b from-emerald-50 via-sky-50 to-indigo-50">
      <header className="sticky top-0 z-20 relative overflow-hidden backdrop-blur bg-gradient-to-r from-emerald-700 via-teal-600 to-indigo-600 text-white border-b border-emerald-700/30">
        <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(1000px 200px at -200px -200px, rgba(255,255,255,0.14), transparent 60%)'}}></div>
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button onClick={function(){setTab('dashboard');}} className="w-10 h-10 rounded-2xl bg-gradient-to-br from-white via-emerald-50 to-emerald-200 text-emerald-700 grid place-items-center font-bold shadow-md ring-1 ring-white/60 hover:shadow-emerald-300/40 transition transform hover:scale-105">{"\uD83C\uDFC8"}</button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold leading-tight">{state.settings.leagueName}</h1>
                {state.ui && state.ui.commishUnlocked ? (
                  <button onClick={function(){ var v=prompt('League name', state.settings.leagueName); if(v){ setState(function(prev){ return {...prev, settings:{...prev.settings, leagueName:v}}; }); } }} className="text-xs underline decoration-dotted text-white/80">Rename</button>
                ) : null}
              </div>
              <p className="text-xs text-gray-200/80">Season {state.settings.seasonYear} - {state.teams.length} Teams</p>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto">
            {TABS.map(function(t){
              const active = tab===t.id;
              const base = "px-3.5 py-2.5 rounded-xl text-sm whitespace-nowrap transition transform hover:-translate-y-0.5 ring-1 ";
              const cls = active ? base+"bg-white/95 text-emerald-700 shadow-lg shadow-emerald-400/20 ring-emerald-200" : base+"bg-white/10 text-white/90 hover:bg-white/20 hover:text-white ring-white/30 backdrop-blur-sm";
              return (<button key={t.id} onClick={function(){setTab(t.id);}} className={cls}>{t.label}</button>);
            })}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 grid gap-4">
        {tab==="dashboard" && <Dashboard state={state} setState={setState} setTab={setTab}/>} 
        {tab==="teams" && <TeamsRosters state={state} setState={setState}/>} 
        {tab==="power" && <PowerRankings state={state}/>} 
        {tab==="previews" && <MatchupPreviews state={state}/>} 
        {tab==="playoffs" && <PlayoffsTab state={state} setState={setState}/>} 
        {tab==="trade" && <TradeAnalyzer state={state}/>} 
        {tab==="free" && <FreeAgents state={state}/>} 
        {tab==="champions" && <ChampionsTab state={state}/>} 
        {tab==="recap" && <WeeklyRecap state={state}/>} 
        {tab==="feed" && <LeagueFeed state={state} setState={setState}/>} 
        {tab==="path" && <StrengthPlayoff state={state}/>} 
        {tab==="tradeboard" && <TradeBlock state={state} setState={setState}/>} 
        {tab==="awards" && <AwardsTab state={state}/>} 
        {tab==="rivalry" && <RivalryTab state={state}/>} 
        {tab==="history" && <LeagueHistoryPublic state={state}/>} 
        {tab==="commish" && <CommissionerTab state={state} setState={setState}/>}
      </main>
      <footer className="max-w-7xl mx-auto p-6 text-center text-xs text-gray-500">Data persists locally</footer>
    </div>
  );
}

const ALL_POS=["QB","RB","WR","TE","DST","K"];
function teamById(state,id){ return state.teams.find(function(t){ return t.id===id; }); }
function allRosteredIds(team){ const slots=["QB","RB","WR","TE","FLEX","DST","K","BENCH"]; var out=[]; for(const slot of slots){ for(const p of team.roster[slot]) out.push(p.id||p); } return out; }
function isOnAnyTeam(state,playerId){ return state.teams.some(function(t){ return allRosteredIds(t).includes(playerId); }); }
function freeAgentList(state){ return state.players.filter(function(p){ return !isOnAnyTeam(state, p.id); }); }
function positionFits(slot,pos){ if(slot==="FLEX") return ["RB","WR","TE"].includes(pos); return slot===pos; }
const ROSTER_SLOTS=["QB","RB","WR","TE","FLEX","DST","K","BENCH"];
function findPlayerSlot(team,playerId){ for(const slot of ROSTER_SLOTS){ const idx=team.roster[slot].findIndex(function(p){ return (p.id||p)===playerId; }); if(idx>=0) return {slot:slot,idx:idx}; } return null; }
function canPlaceInSlot(team,slot,player){ const limit=team.roster._limits[slot]!==undefined?(team.roster._limits[slot]):(slot==="BENCH"?99:0); const len=team.roster[slot].length; return (slot==="BENCH"||positionFits(slot,player.pos)) && len<limit; }
function movePlayerWithinTeam(state,teamId,playerId,toSlot){ const s=deepClone(state); const team=s.teams.find(function(t){ return t.id===teamId; }); if(!team) return state; const ptr=findPlayerSlot(team,playerId); const player=ptr? team.roster[ptr.slot][ptr.idx] : s.players.find(function(p){ return p.id===playerId; }); if(!player) return state; if(ptr&&ptr.slot===toSlot) return s; if(!canPlaceInSlot(team,toSlot,player)) return state; if(ptr){ team.roster[ptr.slot].splice(ptr.idx,1); } team.roster[toSlot].push(player); return s; }
function removePlayerFromTeam(state,teamId,playerId){ const s=deepClone(state); const team=s.teams.find(function(t){ return t.id===teamId; }); const slots=["QB","RB","WR","TE","FLEX","DST","K","BENCH"]; for(const slot of slots){ team.roster[slot]=team.roster[slot].filter(function(p){ return (p.id||p)!==playerId; }); } return s; }
function normalized(arr){ const min=Math.min.apply(null,arr), max=Math.max.apply(null,arr); return arr.map(function(v){ return (max===min?0.5:(v-min)/(max-min)); }); }

function parseCSVLine(row){ const parts=[]; var cur=""; var inQ=false; for(var i=0;i<row.length;i++){ const ch=row[i]; if(ch==='"') inQ=!inQ; else if(ch===','&&!inQ){ parts.push(cur); cur=""; } else cur+=ch; } parts.push(cur); return parts.map(function(s){ return s.replace(/^\"|\"$/g,"").trim(); }); }
function parseNameTeamBye(s){ if(!s) return {name:"",team:"",bye:null}; var cleaned=String(s).trim(); var bye=null; const m=cleaned.match(/\((\d{1,2})\)\s*$/); if(m){ bye=parseInt(m[1]); cleaned=cleaned.replace(/\((\d{1,2})\)\s*$/, '').trim(); } const parts=cleaned.split(/\s+/); const last=parts[parts.length-1]||""; if(/^[A-Z]{2,4}$/.test(last)){ return {name:parts.slice(0,-1).join(" ").trim(), team:last, bye:bye}; } return {name:cleaned, team:"", bye:bye}; }
function estimateProjection(pos,overallRank){ const bases={QB:330,RB:300,WR:290,TE:220,DST:135,K:145}; const base=bases[pos]||200; const r=Math.max(1,(overallRank||150)); const decay=Math.pow(0.985,r-1); return Math.round(base*(0.55+0.45*decay)); }
function parseFantasyProsCSV(text){ const clean=String(text||"").replace(/\uFEFF/g,""); const lines=clean.split(/\r\n|\n|\r/).filter(function(x){return x.length>0;}); if(lines.length===0) return []; const header=parseCSVLine(lines[0]).map(function(h){return h.toLowerCase();}); function idx(name){ return header.findIndex(function(h){ return h.includes(name); }); } const iPlayer=idx('player'); const iPos=idx('pos'); const iTeam=idx('team'); const iBye=idx('bye'); const iRank=idx('rank'); const iAdp=idx('adp'); const out=[]; for(let i=1;i<lines.length;i++){ const cols=parseCSVLine(lines[i]); const rawPlayer=cols[iPlayer]||cols[0]||""; const nt=parseNameTeamBye(rawPlayer); const pos=(cols[iPos]||"").toUpperCase().replace(/[^A-Z]/g,''); const team=(cols[iTeam]||nt.team||"").toUpperCase(); const bye=Number(cols[iBye]||nt.bye||"")||null; const rank=Number(cols[iRank]||"")||i; const adp=Number(cols[iAdp]||"")||rank; const id=hashLite((nt.name||"")+"|"+pos+"|"+team); const projected=estimateProjection(pos, rank); out.push({ id:id, name: nt.name, pos: pos, nfl: team, bye: bye, projected: projected, adp: adp, rank: rank }); } return out.filter(function(p){ return p.name && p.pos; }); }

function weeklyProjectionFromRoster(roster,weeks){ const w=Math.max(1,weeks||14); const season=sumProjectedStarting(roster); return season/w; }
function probFromDiff(diff){ const scale=12; const x=diff/scale; return 1/(1+Math.exp(-x)); }
function americanOdds(p){ if(p<=0||p>=1) return p>=1? -Infinity: Infinity; if(p>=0.5) return -Math.round((p/(1-p))*100); return Math.round(((1-p)/p)*100); }
function roundToHalf(n){ return Math.round(n*2)/2; }
function sumProjectedStarting(roster){ function takeTop(arr,n){ return arr.slice().sort(function(a,b){return b.projected-a.projected;}).slice(0,n); } var total=0; total+=takeTop(roster.QB,1).reduce(function(a,p){return a+p.projected;},0); total+=takeTop(roster.RB,2).reduce(function(a,p){return a+p.projected;},0); total+=takeTop(roster.WR,2).reduce(function(a,p){return a+p.projected;},0); total+=takeTop(roster.TE,1).reduce(function(a,p){return a+p.projected;},0); const pool=[].concat(roster.RB.slice(2),roster.WR.slice(2),roster.TE.slice(1),roster.FLEX); total+=takeTop(pool,1).reduce(function(a,p){return a+p.projected;},0); total+=takeTop(roster.DST,1).reduce(function(a,p){return a+p.projected;},0); total+=takeTop(roster.K,1).reduce(function(a,p){return a+p.projected;},0); return total; }
function buildLine(state,homeTeam,awayTeam){ const weeks=state.settings.weeks||13; const ph=weeklyProjectionFromRoster(homeTeam.roster,weeks); const pa=weeklyProjectionFromRoster(awayTeam.roster,weeks); const diff=ph-pa; const pHome=probFromDiff(diff); const pAway=1-pHome; const ou=roundToHalf(ph+pa); const spread=roundToHalf(Math.abs(diff)); const homeFavored=diff>=0; const mlHome=americanOdds(pHome); const mlAway=americanOdds(pAway); return {homeFavored:homeFavored,spread:spread,ou:ou,mlHome:mlHome,mlAway:mlAway,ph:Math.round(ph),pa:Math.round(pa)}; }
function nextUnscoredWeek(state){ const weeks=state.schedule.map(function(w){return w.week;}).sort(function(a,b){return a-b;}); for(const w of weeks){ const wk=state.schedule.find(function(x){return x.week===w;}); if(wk && wk.games.some(function(g){return !g.final;})) return w; } return weeks[0]||1; }

function Dashboard(p){ const state=p.state; const setTab=p.setTab; return (<div className="grid gap-4"><Card><CardHeader title="Welcome" sub="Quick links"/><CardBody className="flex flex-wrap gap-2"><PrimaryButton onClick={function(){setTab('commish');}}>Open Commissioner</PrimaryButton><Button onClick={function(){setTab('teams');}}>Teams</Button><Button onClick={function(){setTab('previews');}}>Matchup Previews</Button><Button onClick={function(){setTab('trade');}}>Trade Analyzer</Button></CardBody></Card><PowerRankings state={state}/></div>); }

function TeamsRosters(p){ const state=p.state; const [search,setSearch]=useState(""); const filtered=state.teams.filter(function(t){ return (t.name+" "+t.manager).toLowerCase().includes(search.toLowerCase()); }); return (<div className="grid gap-4"><div className="flex items-center justify-between flex-wrap gap-2"><div className="text-sm text-gray-600">Roster slots: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 D/ST, 1 K, 8 BENCH</div><div className="flex items-center gap-2"><Input placeholder="Search teams/managers" value={search} onChange={function(e){setSearch(e.target.value);}}/></div></div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map(function(team){ return (<Card key={team.id}><CardHeader title={team.name+" ("+team.wins+"-"+team.losses+")"} sub={team.manager}/><CardBody><RosterTable team={team} readOnly={true}/></CardBody></Card>); })}</div></div>); }

function RosterTable(p){ const team=p.team; const setState=p.setState; const readOnly=!!p.readOnly; const slotOrder=["QB","RB","WR","TE","FLEX","DST","K","BENCH"]; function remove(pid){ if(!setState) return; setState(function(prev){ return removePlayerFromTeam(prev,team.id,pid); }); } function validDestSlots(team,player,currentSlot){ const opts=[]; for(const slot of ROSTER_SLOTS){ if(slot===currentSlot) continue; if(canPlaceInSlot(team,slot,player)) opts.push(slot); } return opts; } return (<div className="grid gap-3">{slotOrder.map(function(slot){ const limit=team.roster._limits[slot]||0; const players=team.roster[slot]||[]; const placeholders=Math.max(0,limit-players.length); return (<div key={slot}><div className="flex items-center justify-between mb-1"><div className="text-xs font-medium text-gray-500">{slot}</div>{slot!=="BENCH"?<Tag>{players.length+"/"+limit}</Tag>:null}</div><div className="rounded-xl border border-gray-200 overflow-hidden"><table className="w-full text-sm"><tbody>{players.map(function(pl){ return (<tr key={pl.id} className="border-b last:border-0"><td className="p-2 w-12"><Tag>{pl.pos}</Tag></td><td className="p-2">{pl.name} <span className="text-xs text-gray-500">({pl.nfl}{pl.bye?" - Bye "+pl.bye:""})</span></td><td className="p-2 text-xs text-gray-500">Proj {formatNum(pl.projected)}</td>{!readOnly?(<><td className="p-2 w-40"><Select value="" onChange={function(e){ const to=e.target.value; if(!to) return; setState(function(prev){ return movePlayerWithinTeam(prev,team.id,pl.id,to); }); e.target.value=""; }}><option value="">Move to...</option>{validDestSlots(team,pl,slot).map(function(s){ return (<option key={s} value={s}>{s}</option>); })}</Select></td><td className="p-2 text-right"><Button onClick={function(){remove(pl.id);}}>Remove</Button></td></>):null}</tr>); })}{Array.from({length:placeholders}).map(function(_,i){ return (<tr key={"ph-"+i} className="border-b last:border-0 bg-gray-50/40"><td className="p-2 w-12"><Tag>{slot==='FLEX'?'RB/WR/TE':slot}</Tag></td><td className="p-2 text-gray-400">Empty</td><td className="p-2"/>{!readOnly?(<><td className="p-2"/><td className="p-2 text-right"/></>):null}</tr>); })}</tbody></table></div></div>); })}</div>); }
function computeStandings(state){ const winPcts=state.teams.map(function(t){ return (t.wins+t.losses>0? t.wins/(t.wins+t.losses):0); }); const pf=state.teams.map(function(t){ return t.pointsFor||0; }); const nWin=normalized(winPcts); const nPf=normalized(pf); const scored=state.teams.map(function(t,i){ return {...t, prScore:0.7*nWin[i]+0.3*nPf[i]}; }); return scored.sort(function(a,b){ return b.prScore-a.prScore; }); }

function PowerRankings(p){ const state=p.state; const standings=useMemo(function(){ return computeStandings(state); },[state]); return (<Card><CardHeader title="Power Rankings" sub="70% Win %, 30% Points For"/><CardBody><table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">#</th><th className="p-2">Team</th><th className="p-2">Record</th><th className="p-2">PF</th><th className="p-2">PA</th><th className="p-2">Score</th></tr></thead><tbody>{standings.map(function(t,i){ return (<tr key={t.id} className="border-b last:border-0"><td className="p-2">{i+1}</td><td className="p-2 font-medium">{t.name}</td><td className="p-2">{t.wins}-{t.losses}</td><td className="p-2">{formatNum(t.pointsFor)}</td><td className="p-2">{formatNum(t.pointsAgainst)}</td><td className="p-2">{(t.prScore*100).toFixed(1)}</td></tr>); })}</tbody></table></CardBody></Card>); }

function MatchupPreviews(p){ const state=p.state; const [weekSel,setWeekSel]=useState(function(){ const next=nextUnscoredWeek(state); if(next) return next; const all=state.schedule.map(function(w){return w.week;}); return all.length? Math.min.apply(null,all):1; }); const [show,setShow]=useState({}); const weekObj=state.schedule.find(function(w){ return w.week===weekSel; }); const weeks=Array.from({length:state.settings.weeks},function(_,i){return i+1;}); return (<Card><CardHeader title="Matchup Previews" sub="Auto-generated lines from roster strength (for fun only)"/><CardBody><div className="flex items-center gap-2 mb-3"><div className="text-sm">Week</div><Select value={weekSel} onChange={function(e){setWeekSel(parseInt(e.target.value));}}>{weeks.map(function(w){ return (<option key={w} value={w}>Week {w}</option>); })}</Select><div className="text-xs text-gray-500">Lines are projections; no player-level projections are shown.</div></div>{!weekObj||weekObj.games.length===0? (<div className="text-sm text-gray-500">No games scheduled for this week yet.</div>): (<div className="grid gap-3">{weekObj.games.map(function(g,idx){ const home=teamById(state,g.home); const away=teamById(state,g.away); const line=buildLine(state,home,away); const spreadLabel=line.homeFavored? (home.name+" -"+line.spread) : (away.name+" -"+line.spread); return (<div key={idx} className="p-3 rounded-2xl border"><div className="grid md:grid-cols-2 gap-3 items-center"><div className="flex items-center justify-between"><div><div className="font-semibold">{home.name}</div>{g.final?<div className="text-xs text-gray-500">{g.homeScore}</div>:null}</div><div className="text-xs text-gray-500">Proj {line.ph}</div></div><div className="flex items-center justify-between"><div><div className="font-semibold">{away.name}</div>{g.final?<div className="text-xs text-gray-500">{g.awayScore}</div>:null}</div><div className="text-xs text-gray-500">Proj {line.pa}</div></div></div><div className="mt-2 grid md:grid-cols-3 gap-2 text-sm"><div>Spread: {spreadLabel}</div><div>Moneylines: {home.name} {(line.mlHome>0?"+":"")+line.mlHome} | {away.name} {(line.mlAway>0?"+":"")+line.mlAway}</div><div>O/U: {line.ou}</div></div><div className="mt-2 flex"><Button onClick={function(){ setShow(function(s){ return {...s, [idx]: !s[idx]}; }); }}>{show[idx]? 'Hide Rosters':'Show Rosters'}</Button></div>{show[idx]?(<div className="mt-3 grid md:grid-cols-2 gap-3"><div><div className="text-sm font-medium mb-1">{home.name} Roster</div><RosterTable team={home} readOnly={true}/></div><div><div className="text-sm font-medium mb-1">{away.name} Roster</div><RosterTable team={away} readOnly={true}/></div></div>):null}</div>); })}</div>)}</CardBody></Card>); }

function StrengthPlayoff(p){ const state=p.state; const standings=useMemo(function(){ return computeStandings(state); },[state]); const scoreMap=useMemo(function(){ const m={}; for(const t of standings) m[t.id]=t.prScore; return m; },[standings]); const start=nextUnscoredWeek(state); const weeks=Array.from({length:state.settings.weeks},function(_,i){return i+1;}); const rows=state.teams.map(function(team){ const cells=weeks.map(function(w){ const wk=state.schedule.find(function(x){return x.week===w;}); if(!wk) return null; const g=(wk.games||[]).find(function(x){return x.home===team.id||x.away===team.id;}); if(!g) return null; const opp=g.home===team.id? g.away:g.home; const s=scoreMap[opp]||0; return {w:w,s:s,remaining:w>=start}; }); const rem=cells.filter(function(c){return c&&c.remaining;}); const avg=rem.length? rem.reduce(function(a,c){return a+c.s;},0)/rem.length:0; return {team:team,cells:cells,avg:avg}; }).sort(function(a,b){ return a.avg-b.avg; }); return (<Card><CardHeader title="Schedule Strength & Playoff Path" sub="Lower average = easier remaining schedule"/><CardBody><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Team</th>{weeks.map(function(w){ return (<th key={w} className="p-2 text-center">W{w}</th>); })}<th className="p-2 text-right">Avg Remaining</th></tr></thead><tbody>{rows.map(function(r){ return (<tr key={r.team.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{r.team.name}</td>{weeks.map(function(w){ const c=r.cells[w-1]; const val=c?c.s:0; const isFuture=c&&c.remaining; const alpha=0.15+0.35*val; const style=isFuture?{ background: "rgba(220,38,38,"+(alpha)+")" }:{}; const label=c? Math.round(val*100) : "-"; return (<td key={w} className={"p-2 text-center "+(isFuture?"":"text-gray-400")} style={style}>{label}</td>); })}<td className="p-2 text-right">{(r.avg*100).toFixed(1)}</td></tr>); })}</tbody></table></div></CardBody></Card>); }

function TradeBlock(p){ const state=p.state,setState=p.setState; const [player,setPlayer]=useState(""); const [pos,setPos]=useState(""); const [teamId,setTeamId]=useState(state.teams[0]?state.teams[0].id:""); const [notes,setNotes]=useState(""); const [filter,setFilter]=useState({q:"",pos:"",team:""}); useEffect(function(){ if(!state.tradeBlock){ setState(function(prev){ const s=deepClone(prev); s.tradeBlock=[]; return s; }); } },[]); function add(){ if(!player||!pos||!teamId) return; setState(function(prev){ const s=deepClone(prev); s.tradeBlock=s.tradeBlock||[]; const t=teamById(s,teamId); s.tradeBlock.unshift({ id:"tb"+Date.now(), player:player.trim(), pos:pos, teamId:teamId, teamName:t?t.name:"", manager:t?t.manager:"", notes:notes.trim(), ts:Date.now() }); return s; }); setPlayer(""); setPos(""); setNotes(""); } function removeItem(id){ setState(function(prev){ const s=deepClone(prev); s.tradeBlock=(s.tradeBlock||[]).filter(function(e){return e.id!==id;}); return s; }); } const rows=((state.tradeBlock||[]).slice()).sort(function(a,b){return (b.ts||0)-(a.ts||0);}).filter(function(r){ return (!filter.pos||r.pos===filter.pos) && (!filter.team||r.teamId===filter.team) && (!filter.q||(r.player.toLowerCase().includes(filter.q.toLowerCase())|| (r.teamName||"").toLowerCase().includes(filter.q.toLowerCase()))); }); const posList=["QB","RB","WR","TE","DST","K"]; return (<Card><CardHeader title="Trade Block" sub="Managers can post players available for trade"/><CardBody><div className="grid md:grid-cols-3 gap-4 items-start"><div className="rounded-2xl border p-3"><div className="text-sm font-medium mb-2">Add to Trade Block</div><div className="grid gap-2"><div><div className="text-xs text-gray-500 mb-1">Player</div><Input placeholder="e.g., Courtland Sutton" value={player} onChange={function(e){setPlayer(e.target.value);}}/></div><div><div className="text-xs text-gray-500 mb-1">Position</div><Select value={pos} onChange={function(e){setPos(e.target.value);}}><option value="">Select position</option>{posList.map(function(pp){ return (<option key={pp} value={pp}>{pp}</option>); })}</Select></div><div><div className="text-xs text-gray-500 mb-1">Team</div><Select value={teamId} onChange={function(e){setTeamId(e.target.value);}}>{state.teams.map(function(t){ return (<option key={t.id} value={t.id}>{t.name}</option>); })}</Select></div><div><div className="text-xs text-gray-500 mb-1">Notes (optional)</div><Input placeholder="What are you looking for?" value={notes} onChange={function(e){setNotes(e.target.value);}}/></div><PrimaryButton onClick={add}>Post to Block</PrimaryButton></div></div><div className="md:col-span-2"><div className="flex flex-wrap gap-2 items-end mb-2"><div className="w-48"><div className="text-xs text-gray-500 mb-1">Filter by position</div><Select value={filter.pos} onChange={function(e){setFilter(function(f){return {...f,pos:e.target.value};});}}><option value="">All</option>{posList.map(function(pp){ return (<option key={pp} value={pp}>{pp}</option>); })}</Select></div><div className="w-56"><div className="text-xs text-gray-500 mb-1">Filter by team</div><Select value={filter.team} onChange={function(e){setFilter(function(f){return {...f,team:e.target.value};});}}><option value="">All</option>{state.teams.map(function(t){ return (<option key={t.id} value={t.id}>{t.name}</option>); })}</Select></div><div className="flex-1 min-w-[180px]"><div className="text-xs text-gray-500 mb-1">Search</div><Input placeholder="Search player/team" value={filter.q} onChange={function(e){ setFilter(function(f){return {...f,q:e.target.value};}); }}/></div></div><div className="rounded-2xl border overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Player</th><th className="p-2">Pos</th><th className="p-2">Team</th><th className="p-2">Manager</th><th className="p-2">Notes</th><th className="p-2">Posted</th><th className="p-2"></th></tr></thead><tbody>{rows.map(function(r){ return (<tr key={r.id} className="border-b last:border-0"><td className="p-2 font-medium">{r.player}</td><td className="p-2">{r.pos}</td><td className="p-2">{r.teamName}</td><td className="p-2">{r.manager}</td><td className="p-2">{r.notes}</td><td className="p-2 text-xs text-gray-500">{new Date(r.ts).toLocaleString()}</td><td className="p-2 text-right"><Button className="text-xs" onClick={function(){removeItem(r.id);}}>Remove</Button></td></tr>); })}{rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={7}>No trade block posts yet.</td></tr>):null}</tbody></table></div></div></div></CardBody></Card>); }

function AwardsTab(p){ const state=p.state; const weeks=state.schedule.map(function(w){return w.week;}).sort(function(a,b){return a-b;}); const weekAwards=weeks.map(function(w){ const wk=state.schedule.find(function(x){return x.week===w;}); const games=(wk&&wk.games||[]).filter(function(g){return g.final;}); if(!games.length) return null; var top=null,narrow=null,blow=null; for(const g of games){ const th=teamById(state,g.home), ta=teamById(state,g.away); const entries=[{team:th,score:g.homeScore,opp:ta},{team:ta,score:g.awayScore,opp:th}]; for(const e of entries){ if(!top||(e.score||0)>(top.score||0)) top={week:w,team:e.team,score:e.score,opp:e.opp}; } const diff=Math.abs((g.homeScore||0)-(g.awayScore||0)); const winner=(g.homeScore||0)>(g.awayScore||0)? th:ta; if(diff>0){ if(!narrow||diff<(narrow.diff||Infinity)) narrow={week:w,team:winner,diff:diff}; if(!blow||diff>(blow.diff||-Infinity)) blow={week:w,team:winner,diff:diff}; } } return {w:w,top:top,narrow:narrow,blow:blow}; }).filter(function(x){return x;}); const seasonTopPF=state.teams.slice().sort(function(a,b){ return (b.pointsFor||0)-(a.pointsFor||0); })[0]; const seasonBestRecord=state.teams.slice().sort(function(a,b){ return (b.wins-(b.losses))-(a.wins-(a.losses)) || (b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)); })[0]; return (<div className="grid gap-4"><Card><CardHeader title="Weekly Awards" sub="Based on final scores"/><CardBody><div className="grid md:grid-cols-3 gap-3">{weekAwards.map(function(x){ return (<div key={x.w} className="rounded-xl border p-3"><div className="text-sm font-medium mb-2">Week {x.w}</div><div className="text-sm">Top Score: {x.top&&x.top.team?x.top.team.name:""} {x.top?x.top.score:""}</div><div className="text-sm">Narrowest Win: {x.narrow&&x.narrow.team?x.narrow.team.name:""} by {x.narrow?x.narrow.diff:""}</div><div className="text-sm">Biggest Blowout: {x.blow&&x.blow.team?x.blow.team.name:""} by {x.blow?x.blow.diff:""}</div></div>); })}</div></CardBody></Card><Card><CardHeader title="Season Awards (to date)"/><CardBody><div className="grid md:grid-cols-2 gap-3"><div className="rounded-xl border p-3">Most Points For: {seasonTopPF?seasonTopPF.name:""} {formatNum(seasonTopPF?seasonTopPF.pointsFor:0)}</div><div className="rounded-xl border p-3">Best Record: {seasonBestRecord?seasonBestRecord.name:""} {seasonBestRecord?seasonBestRecord.wins:0}-{seasonBestRecord?seasonBestRecord.losses:0}</div></div></CardBody></Card></div>); }

function RivalryTab(p){ const state=p.state; const frList=(state.history&&state.history.franchises)||[]; function labelFr(f){ const team=f.currentTeamId? teamById(state,f.currentTeamId): null; return team? team.name : (f.name+" (legacy)"); } const [a,setA]=useState(frList[0]?frList[0].id:""); const [b,setB]=useState(frList[1]?frList[1].id:""); const yearOptions=useMemo(function(){ const ys=new Set(); for(const s of (state.history.seasons||[])) ys.add(s.year); for(const m of (state.history.matches||[])) if(m&&m.year!=null) ys.add(m.year); ys.add(state.settings.seasonYear); return ["all"].concat(Array.from(ys).sort(function(x,y){return x-y;})); },[state]); const [year,setYear]=useState("all"); const data=useMemo(function(){ if(!a||!b||a===b) return {winsA:0,winsB:0,avgMargin:0,matches:[]}; const matches=[]; for(const m of state.history.matches||[]){ if(year!=="all" && m.year!==Number(year)) continue; if((m.homeFranchiseId===a && m.awayFranchiseId===b) || (m.homeFranchiseId===b && m.awayFranchiseId===a)){ matches.push({ year:m.year, week:m.week, homeFranchiseId:m.homeFranchiseId, awayFranchiseId:m.awayFranchiseId, homeScore:m.homeScore||0, awayScore:m.awayScore||0 }); } } const currYear=state.settings.seasonYear; if(year==="all" || Number(year)===currYear){ for(const wk of state.schedule||[]){ for(const g of (wk.games||[])){ if(!g.final) continue; const fh=franchiseByTeamId(state,g.home); const fa=franchiseByTeamId(state,g.away); if(!fh||!fa) continue; if((fh.id===a&&fa.id===b)||(fh.id===b&&fa.id===a)){ matches.push({ year: currYear, week:wk.week, homeFranchiseId:fh.id, awayFranchiseId:fa.id, homeScore:g.homeScore||0, awayScore:g.awayScore||0 }); } } } } var winsA=0,winsB=0; const margins=[]; for(const m of matches){ const aIsHome=m.homeFranchiseId===a; const as=aIsHome? m.homeScore : m.awayScore; const bs=aIsHome? m.awayScore : m.homeScore; if(as>bs) winsA++; else if(bs>as) winsB++; margins.push(as-bs); } const avgMargin=margins.length? margins.reduce(function(x,y){return x+y;},0)/margins.length : 0; matches.sort(function(x,y){ return (x.year-y.year)||((x.week||0)-(y.week||0)); }); return {winsA:winsA,winsB:winsB,avgMargin:avgMargin,matches:matches}; },[state,a,b,year]); function nameOf(fid){ const f=franchiseById(state,fid); if(!f) return ""; return labelFr(f); } return (<Card><CardHeader title="Rivalry Tracker" sub="Head-to-head history (select franchises, including legacy)"/><CardBody><div className="flex flex-wrap gap-2 items-end mb-3"><div className="flex-1 min-w-[200px]"><div className="text-xs text-gray-500 mb-1">Side A</div><Select value={a} onChange={function(e){setA(e.target.value);}}>{frList.map(function(f){ return (<option key={f.id} value={f.id}>{labelFr(f)}</option>); })}</Select></div><div className="flex-1 min-w-[200px]"><div className="text-xs text-gray-500 mb-1">Side B</div><Select value={b} onChange={function(e){setB(e.target.value);}}>{frList.map(function(f){ return (<option key={f.id} value={f.id}>{labelFr(f)}</option>); })}</Select></div><div className="w-48"><div className="text-xs text-gray-500 mb-1">Year</div><Select value={String(year)} onChange={function(e){ const v=e.target.value; setYear(v==="all"?"all":parseInt(v)); }}>{yearOptions.map(function(y){ return (<option key={String(y)} value={String(y)}>{y==="all"?"All Years":y}</option>); })}</Select></div><div className="ml-auto text-sm">Record: {nameOf(a)} {data.winsA}-{data.winsB} {nameOf(b)} - Avg margin {data.avgMargin.toFixed(1)}</div></div><div className="rounded-2xl border overflow-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Year</th><th className="p-2">Week</th><th className="p-2">Home</th><th className="p-2">Away</th><th className="p-2">Score</th></tr></thead><tbody>{data.matches.map(function(m,i){ return (<tr key={i} className="border-b last:border-0"><td className="p-2">{m.year||""}</td><td className="p-2">{m.week||""}</td><td className="p-2">{nameOf(m.homeFranchiseId)}</td><td className="p-2">{nameOf(m.awayFranchiseId)}</td><td className="p-2">{m.homeScore}-{m.awayScore}</td></tr>); })}{data.matches.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={5}>No head-to-head games for this selection.</td></tr>):null}</tbody></table></div></CardBody></Card>); }

function ContentHub(p){ const state=p.state; const items=[]; for(const n of (state.news&&state.news.posts)||[]){ items.push({type:'news',ts:n.ts||0,title:n.title||'News',body:n.body||''}); } for(const r of state.weeklyRecaps||[]){ items.push({type:'recap',ts:r.ts||0,title:r.title||('Week '+(r.week||'')),body:r.body||''}); } items.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); return (<Card><CardHeader title="Content Hub" sub="News and recaps"/><CardBody><div className="grid gap-3">{items.length===0?<div className="text-sm text-gray-500">No posts yet.</div>:null}{items.map(function(it,idx){ return (<div key={idx} className="rounded-2xl border p-3"><div className="text-xs text-gray-500 mb-1">{it.type==='news'?'News':'Recap'}</div><div className="font-medium">{it.title}</div><div className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{it.body}</div></div>); })}</div></CardBody></Card>); }

function ChampionsTab(p){ const state=p.state; const rows=(state.champions||[]).slice().sort(function(a,b){return b.year-a.year;}); return (<Card><CardHeader title="Past Champions" sub="Read-only"/><CardBody><div className="rounded-2xl border overflow-hidden"><table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Year</th><th className="p-2">Team</th><th className="p-2">Manager</th><th className="p-2">Record</th></tr></thead><tbody>{rows.map(function(r,i){ return (<tr key={i} className="border-b last:border-0"><td className="p-2">{r.year}</td><td className="p-2">{r.team}</td><td className="p-2">{r.manager}</td><td className="p-2">{r.record}</td></tr>); })}</tbody></table></div></CardBody></Card>); }

function WeeklyRecap(p){ const state=p.state; const recaps=state.weeklyRecaps||[]; return (<Card><CardHeader title="Weekly Recap" sub="Drops every Tuesday"/><CardBody><div className="grid gap-3">{recaps.length===0?<div className="text-sm text-gray-500">No recaps yet.</div>:null}{recaps.map(function(r,i){ return (<div key={i} className="rounded-2xl border p-3"><div className="text-xs text-gray-500">Week {r.week}</div><div className="font-medium">{r.title}</div><div className="text-sm whitespace-pre-wrap">{r.body}</div></div>); })}</div></CardBody></Card>); }

function NewsTab(p){ const state=p.state,setState=p.setState; const [title,setTitle]=useState(""); const [body,setBody]=useState(""); function post(){ if(!title) return; setState(function(prev){ const s=deepClone(prev); s.news=s.news||{posts:[]}; s.news.posts.unshift({id:'news'+Date.now(), title:title, body:body, ts:Date.now()}); return s; }); setTitle(""); setBody(""); } return (<Card><CardHeader title="League News"/><CardBody><div className="grid gap-3"><div className="grid md:grid-cols-3 gap-2 items-end"><Input placeholder="Title" value={title} onChange={function(e){setTitle(e.target.value);}}/><Input placeholder="Body" value={body} onChange={function(e){setBody(e.target.value);}}/><PrimaryButton onClick={post}>Post</PrimaryButton></div><div className="grid gap-2">{(state.news&&state.news.posts||[]).map(function(p,i){ return (<div key={p.id||i} className="rounded-xl border p-3"><div className="font-medium">{p.title}</div><div className="text-sm text-gray-700 whitespace-pre-wrap">{p.body}</div></div>); })}</div></div></CardBody></Card>); }

function LeagueFeed(p){ const state=p.state,setState=p.setState; const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [attachments,setAttachments]=useState([]); const fileRef=useRef(null); function addFiles(fs){ const files=Array.from(fs||[]); files.forEach(function(f){ const r=new FileReader(); r.onload=function(){ setAttachments(function(prev){ return prev.concat([{name:f.name,mime:f.type||'application/octet-stream',data:r.result}]); }); }; r.readAsDataURL(f); }); } function onPick(e){ addFiles(e.target.files||[]); } function removeAttachment(i){ setAttachments(function(prev){ const a=prev.slice(); a.splice(i,1); return a; }); } function post(){ if(!title && !body && attachments.length===0) return; setState(function(prev){ const s=deepClone(prev); s.feed=s.feed||{posts:[]}; s.feed.posts.unshift({ id:"post"+Date.now(), ts:Date.now(), title:title.trim(), body:body.trim(), media:attachments, reactions:{}, userReaction:null }); return s; }); setTitle(""); setBody(""); setAttachments([]); if(fileRef.current) fileRef.current.value=""; }
  function requireCommish(){
    return !!(state.ui && state.ui.commishUnlocked);
  }
  function removeItem(it){ if(!it) return; if(!requireCommish()){ alert("Commissioner unlock required. Go to the Commissioner tab and enter the password."); return; } setState(function(prev){ const s=deepClone(prev);
    if(it.type==='post'){ const arr=(s.feed&&s.feed.posts)||[]; const idx=arr.findIndex(function(p){ return (p.id&&it.id&&p.id===it.id) || ((p.ts||0)===(it.ts||0)); }); if(idx>=0){ arr.splice(idx,1); } else { s.feed.posts = arr.filter(function(p){ return !( (p.id&&it.id&&p.id===it.id) || ((p.ts||0)===(it.ts||0)) ); }); } }
    else if(it.type==='news'){ s.news=s.news||{posts:[]}; s.news.posts=s.news.posts.filter(function(nn){ return !((nn.id&&it.id&&nn.id===it.id) || ((nn.ts||0)===(it.ts||0))); }); }
    else if(it.type==='recap'){ s.weeklyRecaps=s.weeklyRecaps||[]; s.weeklyRecaps=s.weeklyRecaps.filter(function(rr){ return !((rr.id&&it.id&&rr.id===it.id) || ((rr.ts||0)===(it.ts||0))); }); }
    return s; }); }
  const combined=[]; if(state.feed&&state.feed.posts){ for(const p of state.feed.posts) combined.push({...p,type:'post',reac:p.reactions||{},mine:p.userReaction||null}); } if(state.news&&state.news.posts){ for(const n of state.news.posts) combined.push({ id: (n.id||( "news"+((n.ts||0)||hashLite((n.title||'')+'|'+(n.body||''))))), ts:n.ts||0, title:n.title||'News', body:n.body||'', media:[], type:'news', reac:n.reactions||{}, mine:n.userReaction||null }); } if(state.weeklyRecaps){ for(const r of state.weeklyRecaps) combined.push({ id: (r.id||( "recap"+((r.ts||0)||hashLite((r.title||'')+'|'+(r.week||''))))), ts:r.ts||0, title:r.title||('Week '+(r.week||'')), body:r.body||'', media:[], type:'recap', week:r.week, reac:r.reactions||{}, mine:r.userReaction||null }); } combined.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); const EMOJIS=["\uD83D\uDC4D","\uD83D\uDD25","\uD83D\uDE02","\uD83D\uDE2E","\uD83D\uDCAF","\uD83D\uDC4E"]; function handleReact(it,emo){ setState(function(prev){ const s=deepClone(prev); function applyToggle(arr,idx){ if(idx<0) return; arr[idx].reactions=arr[idx].reactions||{}; const prevEmoji=arr[idx].userReaction||null; if(prevEmoji===emo){ arr[idx].reactions[emo]=Math.max(0,(arr[idx].reactions[emo]||0)-1); arr[idx].userReaction=null; } else { if(prevEmoji){ arr[idx].reactions[prevEmoji]=Math.max(0,(arr[idx].reactions[prevEmoji]||0)-1); } arr[idx].reactions[emo]=(arr[idx].reactions[emo]||0)+1; arr[idx].userReaction=emo; } }
 if(it.type==='post'){ const arr=s.feed.posts||[]; const idx=arr.findIndex(function(pp){return pp.id===it.id;}); applyToggle(arr,idx);
 } else if(it.type==='news'){ s.news=s.news||{posts:[]}; const arr=s.news.posts; var idx=-1; if(it.id){ idx=arr.findIndex(function(nn){return nn.id===it.id;}); } if(idx<0 && it.ts){ idx=arr.findIndex(function(nn){return (nn.ts||0)===it.ts;}); } if(idx<0){ idx=arr.findIndex(function(nn){return (nn.title||'')===it.title && (nn.body||'')===it.body;}); } applyToggle(arr,idx);
 } else if(it.type==='recap'){ const arr=s.weeklyRecaps||[]; var idx=-1; if(it.id){ idx=arr.findIndex(function(rr){return rr.id===it.id;}); } if(idx<0 && it.ts){ idx=arr.findIndex(function(rr){return (rr.ts||0)===it.ts;}); } if(idx<0 && it.week){ idx=arr.findIndex(function(rr){return rr.week===it.week && (rr.title||'')===it.title;}); } applyToggle(arr,idx);
 }
 return s; }); }
  function ReactionBar(props){ const it=props.it; const totals=it.reac||{}; return (<div className="mt-2 flex flex-wrap gap-2">{EMOJIS.map(function(e){ const c=totals[e]||0; return (<button key={e} type="button" onClick={function(){handleReact(it,e);}} className={(it.mine===e?"px-2 py-1 rounded-full border text-sm bg-emerald-50 ring-2 ring-emerald-400":"px-2 py-1 rounded-full border text-sm bg-white hover:bg-gray-50")}>{e} {c>0?c:" "}</button>); })}</div>); }
  function MediaView(m,i){ if(!m||!m.data) return null; const nm=(m.name||'file'); const mm=(m.mime||''); if(mm.indexOf('image/')===0) return (<img key={i} src={m.data} alt={nm} className="max-h-64 rounded-lg border"/>); if(mm.indexOf('video/')===0) return (<video key={i} controls className="w-full max-h-72 rounded-lg border"><source src={m.data} type={mm}/></video>); if(mm==='application/pdf' || nm.toLowerCase().endsWith('.pdf')) return (<a key={i} href={m.data} target="_blank" rel="noreferrer" className="text-sm underline">Open PDF: {nm}</a>); return (<a key={i} href={m.data} download={nm} className="text-sm underline">Download {nm}</a>); }
  return (<Card><CardHeader title="League Feed" sub="Post updates, media, and recaps"/><CardBody><div className="grid md:grid-cols-3 gap-4 items-start"><div className="rounded-2xl border p-3"><div className="grid gap-2"><Input placeholder="Title" value={title} onChange={function(e){setTitle(e.target.value);}}/><Input placeholder="Say something..." value={body} onChange={function(e){setBody(e.target.value);}}/><input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" onChange={onPick} className="hidden"/><div className="flex gap-2"><Button onClick={function(){ if(fileRef.current) fileRef.current.click(); }}>Attach files</Button><PrimaryButton onClick={post}>Post</PrimaryButton></div>{attachments.length>0?(<div className="grid gap-2"><div className="text-xs text-gray-500">Attachments</div>{attachments.map(function(m,i){ return (<div key={i} className="flex items-center gap-2"><div className="text-xs flex-1 truncate">{m.name}</div><Button className="text-xs" onClick={function(){removeAttachment(i);}}>Remove</Button></div>); })}</div>):null}</div></div><div className="md:col-span-2"><div className="grid gap-3">{combined.length===0?(<div className="text-sm text-gray-500">No posts yet.</div>):null}{combined.map(function(it){ return (<div key={it.id} className="rounded-2xl border p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs text-gray-500 mb-1">{it.type==='recap'?'Recap':it.type==='news'?'News':'Post'}</div><div className="font-medium">{it.title}</div></div>{state.ui && state.ui.commishUnlocked ? (<Button className="text-xs border-rose-300 text-rose-700 hover:bg-rose-50" onClick={function(){removeItem(it);}}>Delete</Button>) : null}</div>{it.body?(<div className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{it.body}</div>):null}{Array.isArray(it.media)&&it.media.length>0?(<div className="mt-2 grid gap-2">{it.media.map(MediaView)}</div>):null}<ReactionBar it={it}/></div>); })}</div></div></div></CardBody></Card>); }

function LeagueHistoryPublic(p){ const state=p.state; const stats=computeHistoryStats(state); const franchises=stats.map(function(st){return {fid:st.fid,name:st.name};}); const years=useMemo(function(){ const ys=new Set(); for(const s of (state.history&&state.history.seasons)||[]){ ys.add(s.year); } return Array.from(ys).sort(function(a,b){return a-b;}); },[state]); function getFinish(fid,year){ const seasons=(state.history&&state.history.seasons)||[]; const season=seasons.find(function(s){return s.year===year;}); const e=season&&season.entries? season.entries.find(function(x){return x.franchiseId===fid;}) : null; return (e&&typeof e.finish==='number')? Number(e.finish):null; } const maxFinish=useMemo(function(){ var m=10; for(const y of years){ for(const f of franchises){ const fin=getFinish(f.fid,y); if(fin!=null) m=Math.max(m,fin); } } return m; },[years,franchises]); function finishColor(fin){ if(fin==null) return "transparent"; const t=(maxFinish - fin + 1)/maxFinish; const light=90 - Math.round(t*50); return "hsl(160,70%,"+light+"%)"; } return (<div className="grid gap-4"> <Card><CardHeader title="Career Leaderboard"/><CardBody><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Franchise</th><th className="p-2">Seasons</th><th className="p-2">W</th><th className="p-2">L</th><th className="p-2">Win %</th><th className="p-2">Champs</th><th className="p-2">Playoffs</th><th className="p-2">Top 3</th><th className="p-2">Top 5</th></tr></thead><tbody>{stats.map(function(st){ return (<tr key={st.fid} className="border-b last:border-0"><td className="p-2">{st.name}</td><td className="p-2">{st.seasons}</td><td className="p-2">{st.wins}</td><td className="p-2">{st.losses}</td><td className="p-2">{(st.winPct*100).toFixed(1)}%</td><td className="p-2">{st.championships}</td><td className="p-2">{st.playoffApps}</td><td className="p-2">{st.top3}</td><td className="p-2">{st.top5}</td></tr>); })}</tbody></table></div></CardBody></Card> <Card><CardHeader title="Finishes Heatmap" sub="Darker = better finish; empty = no data"/><CardBody>{years.length===0? <div className="text-sm text-gray-500">No seasons yet.</div> : (<div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Franchise</th>{years.map(function(y){return (<th key={y} className="p-2 text-center">{y}</th>);})}</tr></thead><tbody>{franchises.map(function(fr){ return (<tr key={fr.fid} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{fr.name}</td>{years.map(function(y){ const fin=getFinish(fr.fid,y); const bg=finishColor(fin); return (<td key={y} className="p-2 text-center" style={{background:bg}} title={(fin!=null?("Finish: "+fin):"No result")}>{fin!=null? fin: ''}</td>); })}</tr>); })}</tbody></table><div className="mt-2 text-xs text-gray-500">Scale uses finish rank (1 best). Color intensity scales within available data; lighter = worse finish.</div></div>)}</CardBody></Card> <Card><CardHeader title="Playoff Appearances Timeline" sub="● playoff · ★ champion"/><CardBody>{years.length===0? <div className="text-sm text-gray-500">No seasons yet.</div> : (<div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Franchise</th>{years.map(function(y){return (<th key={y} className="p-2 text-center">{y}</th>);})}</tr></thead><tbody>{franchises.map(function(fr){ return (<tr key={fr.fid} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{fr.name}</td>{years.map(function(y){ const fin=getFinish(fr.fid,y); const isChamp=fin===1; const madePO=(fin!=null && fin<=4); const sym=isChamp? '★' : (madePO? '●' : ''); const cls=isChamp? 'text-amber-600' : (madePO? 'text-teal-600' : 'text-gray-300'); return (<td key={y} className={"p-2 text-center "+cls} title={isChamp? 'Champion' : (madePO? 'Playoffs' : 'No playoffs')}>{sym}</td>); })}</tr>); })}</tbody></table><div className="mt-2 text-xs text-gray-500">Legend: <span className="text-amber-600">★ Champion</span> · <span className="text-teal-600">● Playoffs</span></div></div>)}</CardBody></Card></div>); }
function ChampionAdmin(p){ const state=p.state,setState=p.setState; const [year,setYear]=useState(new Date().getFullYear()); const [team,setTeam]=useState(""); const [manager,setManager]=useState(""); const [record,setRecord]=useState(""); function add(){ if(!year||!team) return; setState(function(prev){ const s=deepClone(prev); s.champions=s.champions||[]; s.champions.unshift({year:parseInt(year,10),team:team,manager:manager,record:record}); return s; }); setTeam(""); setManager(""); setRecord(""); }
  function remove(i){ setState(function(prev){ const s=deepClone(prev); s.champions.splice(i,1); return s; }); }
  const rows=(state.champions||[]).slice().sort(function(a,b){return b.year-a.year;});
  return (<div className="grid gap-2"><div className="grid md:grid-cols-4 gap-2 items-end"><Input placeholder="Year" value={year} onChange={function(e){setYear(e.target.value);}}/><Input placeholder="Team" value={team} onChange={function(e){setTeam(e.target.value);}}/><Input placeholder="Manager" value={manager} onChange={function(e){setManager(e.target.value);}}/><Input placeholder="Record (e.g., 10-3)" value={record} onChange={function(e){setRecord(e.target.value);}}/><PrimaryButton onClick={add}>Add Champion</PrimaryButton></div><div className="rounded-2xl border overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Year</th><th className="p-2">Team</th><th className="p-2">Manager</th><th className="p-2">Record</th><th className="p-2"></th></tr></thead><tbody>{rows.map(function(r,i){ return (<tr key={i} className="border-b last:border-0"><td className="p-2">{r.year}</td><td className="p-2">{r.team}</td><td className="p-2">{r.manager}</td><td className="p-2">{r.record}</td><td className="p-2 text-right"><Button className="text-xs" onClick={function(){remove(i);}}>Remove</Button></td></tr>); })}{rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={5}>No champions yet.</td></tr>):null}</tbody></table></div></div>);
}

function FranchiseAdmin(p){ const state=p.state,setState=p.setState; const [name,setName]=useState(""); const [teamId,setTeamId]=useState(state.teams[0]?state.teams[0].id:""); const [legacy,setLegacy]=useState(false); function add(){ if(!name) return; setState(function(prev){ const s=deepClone(prev); s.history=s.history||{franchises:[],seasons:[],matches:[]}; const fid='f'+Date.now(); s.history.franchises.push({id:fid,name:name.trim(),currentTeamId: legacy? null : teamId, active: !legacy}); return s; }); setName(""); setLegacy(false); } function remove(fid){ setState(function(prev){ const s=deepClone(prev); s.history.franchises=s.history.franchises.filter(function(f){return f.id!==fid;}); return s; }); } function rename(fid){ const v=prompt('New name'); if(!v) return; setState(function(prev){ const s=deepClone(prev); const f=s.history.franchises.find(function(x){return x.id===fid;}); if(f) f.name=v; return s; }); } const rows=(state.history.franchises||[]).slice(); return (<div className="grid gap-2"><div className="grid md:grid-cols-4 gap-2 items-end"><Input placeholder="Franchise name" value={name} onChange={function(e){setName(e.target.value);}}/>{legacy? (<div className="text-xs text-gray-500">Legacy franchise (no current team)</div>) : (<Select value={teamId} onChange={function(e){setTeamId(e.target.value);}}>{state.teams.map(function(t){return (<option key={t.id} value={t.id}>{t.name}</option>);})}</Select>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={legacy} onChange={function(e){setLegacy(e.target.checked);}}/>Legacy franchise</label><PrimaryButton onClick={add}>Add Franchise</PrimaryButton></div><div className="rounded-2xl border overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Name</th><th className="p-2">Linked Team</th><th className="p-2"></th></tr></thead><tbody>{rows.map(function(f){ return (<tr key={f.id} className="border-b last:border-0"><td className="p-2">{f.name}</td><td className="p-2">{f.currentTeamId? (teamById(state,f.currentTeamId)?teamById(state,f.currentTeamId).name:"") : "—"}</td><td className="p-2 text-right"><div className="flex gap-2 justify-end"><Button className="text-xs" onClick={function(){rename(f.id);}}>Rename</Button><Button className="text-xs" onClick={function(){remove(f.id);}}>Remove</Button></div></td></tr>); })}{rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={3}>No franchises yet.</td></tr>):null}</tbody></table></div></div>); }

function FeedAdmin(p){ const state=p.state,setState=p.setState; const rows=[]; if(state.feed&&state.feed.posts){ for(const x of state.feed.posts){ rows.push({type:'post',id:x.id,ts:x.ts,title:x.title,body:x.body}); } } if(state.news&&state.news.posts){ for(const x of state.news.posts){ rows.push({type:'news',id:x.id||('news'+(x.ts||'')),ts:x.ts,title:x.title,body:x.body}); } } if(state.weeklyRecaps){ for(const x of state.weeklyRecaps){ rows.push({type:'recap',id:x.id||('recap'+(x.ts||'')),ts:x.ts,title:x.title,body:x.body}); } } rows.sort(function(a,b){return (b.ts||0)-(a.ts||0);}); function del(it){ if(!window.confirm('Delete this entry?')) return; setState(function(prev){ const s=deepClone(prev); if(it.type==='post'){ s.feed.posts=s.feed.posts.filter(function(p){return p.id!==it.id;}); } else if(it.type==='news'){ s.news.posts=s.news.posts.filter(function(p){return (p.id||('news'+(p.ts||'')))!==it.id;}); } else if(it.type==='recap'){ s.weeklyRecaps=s.weeklyRecaps.filter(function(p){return (p.id||('recap'+(p.ts||'')))!==it.id;}); } return s; }); }
  return (<div className="rounded-2xl border overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Type</th><th className="p-2">Title</th><th className="p-2">When</th><th className="p-2"></th></tr></thead><tbody>{rows.map(function(r){ return (<tr key={r.id} className="border-b last:border-0"><td className="p-2">{r.type}</td><td className="p-2">{r.title}</td><td className="p-2 text-xs text-gray-500">{r.ts?new Date(r.ts).toLocaleString():''}</td><td className="p-2 text-right"><Button className="text-xs" onClick={function(){del(r);}}>Delete</Button></td></tr>); })}{rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={4}>No items.</td></tr>):null}</tbody></table></div>);
}

function computeSeeds(state){
  const arr=state.teams.slice().map(function(t){ return { id:t.id, name:t.name, wins:t.wins||0, losses:t.losses||0, pf:t.pointsFor||0 }; });
  arr.sort(function(a,b){ return (b.wins-a.wins) || (b.pf-a.pf) || a.name.localeCompare(b.name); });
  return arr.map(function(t,idx){ return {seed:idx+1, team:teamById(state,t.id)}; });
}
function lastFinalWeek(state){
  var last=0; for(const wk of state.schedule||[]){ if((wk.games||[]).some(function(g){return g.final;})) last=Math.max(last,wk.week||0); }
  return last;
}
function expectedWinsFromWeek(state,fromWeek){
  const pr=computeStandings(state); const prMap={}; pr.forEach(function(t){ prMap[t.id]=t.prScore; });
  const totals={}; state.teams.forEach(function(t){ totals[t.id]={wins:0}; });
  for(const wk of state.schedule||[]){ for(const g of (wk.games||[])){ if(g.final){ if(g.homeScore>g.awayScore) totals[g.home].wins++; else if(g.awayScore>g.homeScore) totals[g.away].wins++; } }}
  for(const wk of state.schedule||[]){ if(wk.week<=fromWeek) continue; for(const g of (wk.games||[])){ const pHome=prMap[g.home]||0; const pAway=prMap[g.away]||0; const p=1/(1+Math.exp(-(pHome-pAway)*6)); totals[g.home].wins+=p; totals[g.away].wins+=(1-p); } }
  return totals;
}
function playoffProbabilitySeries(state){
  const weeks=Array.from({length:state.settings.weeks},function(_,i){return i+1;});
  const last=lastFinalWeek(state);
  const series=weeks.map(function(w){ const exp=expectedWinsFromWeek(state,w); const list=state.teams.map(function(t){ return {id:t.id, name:t.name, wins:(exp[t.id]?exp[t.id].wins:0)}; }).sort(function(a,b){ return (b.wins-a.wins) || ((teamById(state,b.id).pointsFor||0)-(teamById(state,a.id).pointsFor||0)); }); const top=list.slice(0,4).map(function(x){return x.id;}); const row={week:w}; state.teams.forEach(function(t){ row[t.id]= top.includes(t.id)?1:0; }); return row; });
  return {series:series.filter(function(r){return r.week<=Math.max(1,last||1);})};
}
function BracketSeed(p){ const t=p.team; return (<div className="rounded-xl border p-2 bg-white"><div className="text-xs text-gray-500">Seed {p.seed}</div><div className="font-medium">{t?t.name:"TBD"}</div></div>); }
function WinnersBracket(p){ const seeds=p.seeds; const s1=seeds[0]||{}; const s2=seeds[1]||{}; const s3=seeds[2]||{}; const s4=seeds[3]||{}; return (<div className="grid md:grid-cols-3 gap-4"><div className="grid gap-4"><BracketSeed seed={1} team={s1.team}/><BracketSeed seed={4} team={s4.team}/></div><div className="grid gap-4"><BracketSeed seed={2} team={s2.team}/><BracketSeed seed={3} team={s3.team}/></div><div className="grid gap-4"><div className="rounded-xl border p-2 bg-gray-50">Final</div><div className="rounded-xl border p-2 bg-gray-50">3rd Place</div></div></div>); }
function LosersBracket(p){ const seeds=p.seeds; const others=seeds.slice(4); if(others.length<6){ return (<div className="text-sm text-gray-500">Losers bracket will populate when there are at least 10 teams (6 non-playoff teams). Current non-playoff teams: {others.length}.</div>); }
  const l=[others[0],others[1],others[2],others[3],others[4],others[5]]; return (<div className="grid md:grid-cols-3 gap-4"><div className="grid gap-4"><BracketSeed seed={5} team={l[0].team}/><div className="rounded-xl border p-2 bg-gray-50">Winner QF2</div></div><div className="grid gap-4"><div className="rounded-xl border p-2 bg-gray-50">Winner QF1</div><BracketSeed seed={6} team={l[1].team}/></div><div className="grid gap-4"><div className="rounded-xl border p-2 bg-gray-50">Losers Final</div><div className="rounded-xl border p-2 bg-gray-50"> </div></div><div className="md:col-span-3 grid md:grid-cols-2 gap-4"><div className="grid gap-2"><div className="text-sm font-medium">Quarterfinal 1</div><BracketSeed seed={7} team={l[2].team}/><BracketSeed seed={10} team={l[5].team}/></div><div className="grid gap-2"><div className="text-sm font-medium">Quarterfinal 2</div><BracketSeed seed={8} team={l[3].team}/><BracketSeed seed={9} team={l[4].team}/></div></div></div>); }
function PlayoffProbabilityChart(p){ const state=p.state; const data=playoffProbabilitySeries(state).series; const palette=["#ef4444","#06b6d4","#10b981","#f97316","#8b5cf6","#22c55e","#eab308","#3b82f6","#f43f5e","#14b8a6"]; const colorMap={}; state.teams.forEach(function(t,i){ colorMap[t.id]=palette[i%palette.length]; }); const [show,setShow]=useState(function(){ const m={}; state.teams.forEach(function(t){ m[t.id]=true; }); return m; }); const weeks=data.map(function(r){return r.week;}); const yTicks=[0,0.25,0.5,0.75,1]; return (<div style={{width:'100%',height:260}}><ResponsiveContainer><LineChart data={data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="week" ticks={weeks}/><YAxis domain={[0,1]} ticks={yTicks} allowDecimals /><Tooltip/>{state.teams.map(function(t){ if(!show[t.id]) return null; return (<Line key={t.id} type="linear" dataKey={t.id} name={t.name} stroke={colorMap[t.id]} dot={false} strokeWidth={2} connectNulls />); })}</LineChart></ResponsiveContainer><div className="mt-2 flex flex-wrap gap-2">{state.teams.map(function(t){ const on=!!show[t.id]; return (<button key={t.id} type="button" onClick={function(){ setShow(function(prev){ return {...prev,[t.id]:!on}; }); }} className={(on?"px-2 py-1 rounded-full border text-xs font-medium":"px-2 py-1 rounded-full border text-xs opacity-60")} style={{borderColor:colorMap[t.id], color:colorMap[t.id]}}>{t.name}</button>); })}</div></div>); }
function PlayoffsTab(p){ const state=p.state; const seeds=computeSeeds(state); return (<div className="grid gap-4"><Card><CardHeader title="Projected Seeds" sub="Sorted by record, then points for"/><CardBody><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Seed</th><th className="p-2">Team</th><th className="p-2">Record</th><th className="p-2">PF</th></tr></thead><tbody>{seeds.map(function(s){ const t=s.team; return (<tr key={s.seed} className="border-b last:border-0"><td className="p-2">{s.seed}</td><td className="p-2">{t?t.name:""}</td><td className="p-2">{t?(t.wins||0):0}-{t?(t.losses||0):0}</td><td className="p-2">{t?formatNum(t.pointsFor):0}</td></tr>); })}</tbody></table></div></CardBody></Card><Card><CardHeader title="Winners Bracket" sub="Top 4 teams - single elimination with 3rd place"/><CardBody><WinnersBracket seeds={seeds}/></CardBody></Card><Card><CardHeader title="Losers Bracket" sub="Remaining 6 teams - single elimination"/><CardBody><LosersBracket seeds={seeds}/></CardBody></Card><Card><CardHeader title="Playoff Probability" sub="Changes as results are entered"/><CardBody><PlayoffProbabilityChart state={state}/></CardBody></Card></div>); }

function TradeAnalyzer(p){ const state=p.state; const teams=state.teams||[]; const [a,setA]=useState(teams[0]?teams[0].id:""); const [b,setB]=useState(teams[1]?teams[1].id:""); const teamA=teamById(state,a); const teamB=teamById(state,b);
  // helpers
  function rosterPlayers(team){ if(!team) return []; const seen={}; const out=[]; for(const slot of ROSTER_SLOTS){ for(const raw of (team.roster[slot]||[])){ const pl=(raw&&raw.id)? raw : state.players.find(function(x){return x.id===(raw&&raw.id?raw.id:raw);}); if(!pl||!pl.id||seen[pl.id]) continue; seen[pl.id]=1; out.push(pl); } } return out.sort(function(x,y){ return (x.pos||'').localeCompare(y.pos||'') || (x.rank||9999)-(y.rank||9999) || x.name.localeCompare(y.name); }); }
  function rosterWithoutPlayers(roster, ids){ const r=deepClone(roster); for(const slot of ROSTER_SLOTS){ r[slot]=(r[slot]||[]).filter(function(p){ return !ids.has((p.id||p)); }); } return r; }
  function rosterAddPlayers(roster, players){ const r=deepClone(roster); for(const p of players){ const pos=(p.pos||'').toUpperCase(); if(pos==='QB') r.QB.push(p); else if(pos==='RB') r.RB.push(p); else if(pos==='WR') r.WR.push(p); else if(pos==='TE') r.TE.push(p); else if(pos==='DST') r.DST.push(p); else if(pos==='K') r.K.push(p); else r.BENCH.push(p); } return r; }
  const [offerA,setOfferA]=useState({}); const [offerB,setOfferB]=useState({}); function toggleOffer(side,id){ if(side==='A') setOfferA(function(prev){ const n={...prev}; n[id]=!n[id]; return n; }); else setOfferB(function(prev){ const n={...prev}; n[id]=!n[id]; return n; }); }
  const listA=useMemo(function(){ return rosterPlayers(teamA); },[teamA,state.players,state.teams]); const listB=useMemo(function(){ return rosterPlayers(teamB); },[teamB,state.players,state.teams]);
  const sendA=listA.filter(function(p){return offerA[p.id];}); const sendB=listB.filter(function(p){return offerB[p.id];});
  const beforeA=Math.round(teamA?sumProjectedStarting(teamA.roster):0); const beforeB=Math.round(teamB?sumProjectedStarting(teamB.roster):0);
  var afterA=beforeA, afterB=beforeB, deltaA=0, deltaB=0; if(teamA&&teamB){ const aOut=new Set(sendA.map(function(p){return p.id;})); const bOut=new Set(sendB.map(function(p){return p.id;})); const rA2=rosterAddPlayers(rosterWithoutPlayers(teamA.roster,aOut), sendB); const rB2=rosterAddPlayers(rosterWithoutPlayers(teamB.roster,bOut), sendA); afterA=Math.round(sumProjectedStarting(rA2)); afterB=Math.round(sumProjectedStarting(rB2)); deltaA=afterA-beforeA; deltaB=afterB-beforeB; }
  function grade(dA,dB){ const swing=Math.abs(dA-dB); if(swing<=1) return {label:'A',desc:'Very even'}; if(swing<=3) return {label:'B',desc:'Close'}; if(swing<=6) return {label:'C',desc:'Somewhat uneven'}; if(swing<=10) return {label:'D',desc:'Uneven'}; return {label:'F',desc:'Lopsided'}; }
  const g=grade(deltaA,deltaB);
  function clear(){ setOfferA({}); setOfferB({}); }
  function swap(){ const oldA=a, oldB=b; setA(oldB); setB(oldA); setOfferA({}); setOfferB({}); }
  return (<Card>
    <CardHeader title="Trade Analyzer" sub="Pick two teams, select players going each way. We simulate best starting lineup value after the trade."/>
    <CardBody>
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* Team A */}
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-medium mb-2">Team A</div>
          <Select value={a} onChange={function(e){setA(e.target.value); clear();}}>{teams.map(function(t){return (<option key={t.id} value={t.id}>{t.name}</option>);})}</Select>
          {!teamA? <div className="text-sm text-gray-500 mt-2">Choose a team.</div> : (
            <div className="mt-3 rounded-xl border overflow-auto" style={{maxHeight:300}}>
              <table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Send</th><th className="p-2">Player</th><th className="p-2">Pos</th><th className="p-2">Proj</th></tr></thead>
              <tbody>{listA.map(function(pl){ const on=!!offerA[pl.id]; return (<tr key={pl.id} className="border-b last:border-0"><td className="p-2 w-10"><input type="checkbox" checked={on} onChange={function(){toggleOffer('A',pl.id);}}/></td><td className="p-2 font-medium">{pl.name}</td><td className="p-2">{pl.pos}</td><td className="p-2">{formatNum(pl.projected)}</td></tr>); })}{listA.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={4}>No players.</td></tr>):null}</tbody></table>
            </div>
          )}
        </div>
        {/* Summary */}
        <div className="rounded-2xl border p-3 bg-white">
          <div className="flex items-center justify-between mb-2"><div className="text-sm font-medium">Summary</div><div className="text-xs text-gray-500">Grade: <span className="font-semibold">{g.label}</span> <span className="text-gray-500">({g.desc})</span></div></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-gray-500">{teamA?teamA.name:'Team A'} change</div>
              <div className={(deltaA>0? 'text-emerald-600':'text-rose-600')+" text-lg font-semibold"}>{deltaA>0?'+':''}{deltaA}</div>
              <div className="text-xs text-gray-500">Before {beforeA} → After {afterA}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">{teamB?teamB.name:'Team B'} change</div>
              <div className={(deltaB>0? 'text-emerald-600':'text-rose-600')+" text-lg font-semibold"}>{deltaB>0?'+':''}{deltaB}</div>
              <div className="text-xs text-gray-500">Before {beforeB} → After {afterB}</div>
            </div>
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-1">A sends → B</div>
              {sendA.length? sendA.map(function(p){return (<div key={p.id}>{p.name} <span className="text-xs text-gray-500">({p.pos})</span></div>);}) : <div className="text-gray-500 text-xs">None</div>}
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">B sends → A</div>
              {sendB.length? sendB.map(function(p){return (<div key={p.id}>{p.name} <span className="text-xs text-gray-500">({p.pos})</span></div>);}) : <div className="text-gray-500 text-xs">None</div>}
            </div>
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={clear}>Clear</Button><Button onClick={swap}>Swap sides</Button></div>
          <div className="mt-3 text-xs text-gray-500">We estimate weekly value from current rosters and simulate the best starting lineup after the trade. FLEX is auto-chosen. This is a guide, not advice.</div>
        </div>
        {/* Team B */}
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-medium mb-2">Team B</div>
          <Select value={b} onChange={function(e){setB(e.target.value); clear();}}>{teams.map(function(t){return (<option key={t.id} value={t.id}>{t.name}</option>);})}</Select>
          {!teamB? <div className="text-sm text-gray-500 mt-2">Choose a team.</div> : (
            <div className="mt-3 rounded-xl border overflow-auto" style={{maxHeight:300}}>
              <table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Send</th><th className="p-2">Player</th><th className="p-2">Pos</th><th className="p-2">Proj</th></tr></thead>
              <tbody>{listB.map(function(pl){ const on=!!offerB[pl.id]; return (<tr key={pl.id} className="border-b last:border-0"><td className="p-2 w-10"><input type="checkbox" checked={on} onChange={function(){toggleOffer('B',pl.id);}}/></td><td className="p-2 font-medium">{pl.name}</td><td className="p-2">{pl.pos}</td><td className="p-2">{formatNum(pl.projected)}</td></tr>); })}{listB.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={4}>No players.</td></tr>):null}</tbody></table>
            </div>
          )}
        </div>
      </div>
    </CardBody>
  </Card>); }
function RosterAdmin(p){
  const state=p.state, setState=p.setState;
  const [teamId,setTeamId]=useState(state.teams[0]?state.teams[0].id:"");
  const [q,setQ]=useState("");
  const [pos,setPos]=useState("");
  const team=teamById(state,teamId);
  const pool=freeAgentList(state).filter(function(pl){
    return (!q||pl.name.toLowerCase().includes(q.toLowerCase())) && (!pos||pl.pos===pos);
  }).slice(0,200);
  function addTo(slot,pl){
    if(!team) return;
    if(!canPlaceInSlot(team,slot,pl)) return;
    setState(function(prev){
      const s=deepClone(prev);
      const t=teamById(s,teamId);
      if(!t) return prev;
      t.roster[slot].push(pl);
      return s;
    });
  }
  const posList=["QB","RB","WR","TE","DST","K"];
  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      <div className="rounded-2xl border p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Team</div>
            <Select value={teamId} onChange={function(e){setTeamId(e.target.value);}}>
              {state.teams.map(function(t){return (<option key={t.id} value={t.id}>{t.name}</option>);})}
            </Select>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Search free agents</div>
            <Input placeholder="Name" value={q} onChange={function(e){setQ(e.target.value);}}/>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Position</div>
            <Select value={pos} onChange={function(e){setPos(e.target.value);}}>
              <option value="">All</option>
              {posList.map(function(pp){return (<option key={pp} value={pp}>{pp}</option>);})}
            </Select>
          </div>
        </div>
        <div className="mt-3 rounded-xl border overflow-auto" style={{maxHeight:360}}>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="p-2">Player</th><th className="p-2">Pos</th><th className="p-2">NFL</th><th className="p-2">Proj</th><th className="p-2">Add</th></tr>
            </thead>
            <tbody>
              {pool.map(function(pl){
                const dests=ROSTER_SLOTS.filter(function(s){return s!=="BENCH" && canPlaceInSlot(team,s,pl);});
                return (
                  <tr key={pl.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{pl.name}</td>
                    <td className="p-2">{pl.pos}</td>
                    <td className="p-2">{pl.nfl}</td>
                    <td className="p-2">{formatNum(pl.projected)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {dests.map(function(s){ return (<Button key={s} className="text-xs" onClick={function(){addTo(s,pl);}}>{s}</Button>); })}
                        <Button className="text-xs" onClick={function(){addTo('BENCH',pl);}}>BENCH</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pool.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={5}>No matches.</td></tr>):null}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="text-sm font-medium mb-2">{team?team.name:"Select a team"} Roster</div>
        {team?(<RosterTable team={team} setState={setState} readOnly={false}/>):(<div className="text-sm text-gray-500">Pick a team.</div>)}
      </div>
    </div>
  );
}
function CSVImportAdmin(p){ const state=p.state,setState=p.setState; const [fileName,setFileName]=useState(""); const inputRef=useRef(null); const [mode,setMode]=useState("append"); function pick(){ if(inputRef.current) inputRef.current.click(); } function onFile(e){ const f=e.target.files&&e.target.files[0]; if(!f) return; setFileName(f.name); const r=new FileReader(); r.onload=function(){ const txt=String(r.result||""); const parsed=parseFantasyProsCSV(txt); setState(function(prev){ const s=deepClone(prev); if(mode==="replace"){ s.players=parsed; } else { const byId={}; s.players.forEach(function(p){byId[p.id]=1;}); parsed.forEach(function(p){ if(!byId[p.id]) s.players.push(p); }); } return s; }); }; r.readAsText(f); e.target.value=""; } return (<div className="flex flex-wrap gap-3 items-center"><input ref={inputRef} type="file" accept=".csv" onChange={onFile} className="hidden"/><Button onClick={pick}>Choose CSV</Button><div className="text-xs text-gray-500">{fileName||"No file chosen"}</div><Select value={mode} onChange={function(e){setMode(e.target.value);}}><option value="append">Append</option><option value="replace">Replace</option></Select></div>); }
function getOrCreateWeek(s,week){ let w=s.schedule.find(function(x){return x.week===week;}); if(!w){ w={week:week,games:[]}; s.schedule.push(w); } return w; }
function ScheduleAdmin(p){ const state=p.state,setState=p.setState; const [week,setWeek]=useState(1); const [home,setHome]=useState(state.teams[0]?state.teams[0].id:""); const [away,setAway]=useState(state.teams[1]?state.teams[1].id:""); function add(){ if(!home||!away||home===away) return; setState(function(prev){ let s=deepClone(prev); const w=getOrCreateWeek(s,Number(week)); w.games.push({home:home,away:away,homeScore:0,awayScore:0,final:false}); return s; }); } function removeGame(idx){ setState(function(prev){ let s=deepClone(prev); const w=getOrCreateWeek(s,Number(week)); w.games.splice(idx,1); s=recomputeTeamTotals(s); return s; }); } function update(idx,field,val){ setState(function(prev){ let s=deepClone(prev); const w=getOrCreateWeek(s,Number(week)); const g=w.games[idx]; if(!g) return prev; if(field==='final'){ g.final=!!val; } else if(field==='homeScore'){ g.homeScore=Number(val)||0; } else if(field==='awayScore'){ g.awayScore=Number(val)||0; } s=recomputeTeamTotals(s); return s; }); } const curr=state.schedule.find(function(x){return x.week===Number(week);}); const games=(curr&&curr.games)||[]; const weeks=Array.from({length:state.settings.weeks},function(_,i){return i+1;}); return (<div className="grid gap-3"><div className="grid md:grid-cols-7 gap-2 items-end"><div><div className="text-xs text-gray-500 mb-1">Week</div><Select value={week} onChange={function(e){setWeek(parseInt(e.target.value,10));}}>{weeks.map(function(w){return (<option key={w} value={w}>{w}</option>);})}</Select></div><div className="md:col-span-2"><div className="text-xs text-gray-500 mb-1">Home</div><Select value={home} onChange={function(e){setHome(e.target.value);}}>{state.teams.map(function(t){return (<option key={t.id} value={t.id}>{t.name}</option>);})}</Select></div><div className="md:col-span-2"><div className="text-xs text-gray-500 mb-1">Away</div><Select value={away} onChange={function(e){setAway(e.target.value);}}>{state.teams.map(function(t){return (<option key={t.id} value={t.id}>{t.name}</option>);})}</Select></div><div className="md:col-span-2"><PrimaryButton onClick={add}>Add Game</PrimaryButton></div></div><div className="rounded-2xl border overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Home</th><th className="p-2">Away</th><th className="p-2">Home Score</th><th className="p-2">Away Score</th><th className="p-2">Final</th><th className="p-2"></th></tr></thead><tbody>{games.map(function(g,i){ return (<tr key={i} className="border-b last:border-0"><td className="p-2">{teamById(state,g.home)?teamById(state,g.home).name:""}</td><td className="p-2">{teamById(state,g.away)?teamById(state,g.away).name:""}</td><td className="p-2 w-24"><Input type="number" value={g.homeScore||0} onChange={function(e){update(i,'homeScore',e.target.value);}}/></td><td className="p-2 w-24"><Input type="number" value={g.awayScore||0} onChange={function(e){update(i,'awayScore',e.target.value);}}/></td><td className="p-2 text-center"><input type="checkbox" checked={!!g.final} onChange={function(e){update(i,'final',e.target.checked);}}/></td><td className="p-2 text-right"><Button className="text-xs" onClick={function(){removeGame(i);}}>Remove</Button></td></tr>); })}{games.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={6}>No games yet for this week.</td></tr>):null}</tbody></table></div></div>); }
function SeasonAdmin(p){ const state=p.state,setState=p.setState; const [year,setYear]=useState(state.settings.seasonYear); const [fid,setFid]=useState((state.history.franchises[0]&&state.history.franchises[0].id)||""); const [teamName,setTeamName]=useState(""); const [manager,setManager]=useState(""); const [wins,setWins]=useState(0); const [losses,setLosses]=useState(0); const [finish,setFinish]=useState(1); function add(){ if(!year||!fid) return; setState(function(prev){ const s=deepClone(prev); s.history=s.history||{franchises:[],seasons:[],matches:[]}; let season=s.history.seasons.find(function(x){return x.year===Number(year);}); if(!season){ season={year:Number(year),entries:[]}; s.history.seasons.push(season); } const idx=season.entries.findIndex(function(e){return e.franchiseId===fid;}); const entry={franchiseId:fid,teamName:teamName,manager:manager,wins:Number(wins)||0,losses:Number(losses)||0,finish:Number(finish)||null}; if(idx>=0) season.entries[idx]=entry; else season.entries.push(entry); return s; }); setTeamName(""); setManager(""); }
  function removeRow(y,fr){ setState(function(prev){ const s=deepClone(prev); const season=s.history.seasons.find(function(x){return x.year===y;}); if(season){ season.entries=season.entries.filter(function(e){return e.franchiseId!==fr;}); } return s; }); }
  const seasons=(state.history&&state.history.seasons||[]).slice().sort(function(a,b){return b.year-a.year;}); return (<div className="grid gap-3"><div className="grid md:grid-cols-6 gap-2 items-end"><Input placeholder="Year" value={year} onChange={function(e){setYear(e.target.value);}}/><Select value={fid} onChange={function(e){setFid(e.target.value);}}>{(state.history.franchises||[]).map(function(f){return (<option key={f.id} value={f.id}>{f.name}</option>);})}</Select><Input placeholder="Team name (that year)" value={teamName} onChange={function(e){setTeamName(e.target.value);}}/><Input placeholder="Manager" value={manager} onChange={function(e){setManager(e.target.value);}}/><Input placeholder="Wins" type="number" value={wins} onChange={function(e){setWins(e.target.value);}}/><Input placeholder="Losses" type="number" value={losses} onChange={function(e){setLosses(e.target.value);}}/><div className="md:col-span-6 grid md:grid-cols-6 gap-2 items-end"><Input placeholder="Finish (1=champion)" type="number" value={finish} onChange={function(e){setFinish(e.target.value);}}/><PrimaryButton onClick={add}>Add Record</PrimaryButton></div></div><div className="rounded-2xl border overflow-auto" style={{maxHeight:360}}><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Year</th><th className="p-2">Franchise</th><th className="p-2">Team</th><th className="p-2">Manager</th><th className="p-2">W</th><th className="p-2">L</th><th className="p-2">Finish</th><th className="p-2"></th></tr></thead><tbody>{seasons.flatMap(function(s){ return (s.entries||[]).map(function(e,i){ return (<tr key={s.year+"-"+e.franchiseId+"-"+i} className="border-b last:border-0"><td className="p-2">{s.year}</td><td className="p-2">{franchiseName(state,e.franchiseId)}</td><td className="p-2">{e.teamName||""}</td><td className="p-2">{e.manager||""}</td><td className="p-2">{e.wins}</td><td className="p-2">{e.losses}</td><td className="p-2">{e.finish!=null?e.finish:""}</td><td className="p-2 text-right"><Button className="text-xs" onClick={function(){removeRow(s.year,e.franchiseId);}}>Remove</Button></td></tr>); }); })}{seasons.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={8}>No records yet.</td></tr>):null}</tbody></table></div></div>); }
function MatchesAdmin(p){ const state=p.state,setState=p.setState; const frs=(state.history&&state.history.franchises)||[]; const [year,setYear]=useState(state.settings.seasonYear-1); const [week,setWeek]=useState(1); const [home,setHome]=useState(frs[0]?frs[0].id:""); const [away,setAway]=useState(frs[1]?frs[1].id:""); const [hs,setHs]=useState(0); const [as,setAs]=useState(0); function add(){ if(!home||!away||home===away) return; setState(function(prev){ const s=deepClone(prev); s.history=s.history||{franchises:[],seasons:[],matches:[]}; s.history.matches=s.history.matches||[]; s.history.matches.push({ id:'m'+Date.now(), year:Number(year)||null, week:Number(week)||null, homeFranchiseId:home, awayFranchiseId:away, homeScore:Number(hs)||0, awayScore:Number(as)||0 }); return s; }); } function remove(id){ setState(function(prev){ const s=deepClone(prev); s.history.matches=(s.history.matches||[]).filter(function(m){return m.id!==id;}); return s; }); } const rows=(state.history&&state.history.matches||[]).slice().sort(function(a,b){ return (a.year-b.year)||((a.week||0)-(b.week||0)); }); function label(fid){ const f=franchiseById(state,fid)||{}; const t=f.currentTeamId? teamById(state,f.currentTeamId) : null; return t? t.name : (f.name||''); } return (<div className="grid gap-2"><div className="grid md:grid-cols-6 gap-2 items-end"><Input placeholder="Year" value={year} onChange={function(e){setYear(e.target.value);}}/><Input placeholder="Week (optional)" value={week} onChange={function(e){setWeek(e.target.value);}}/><Select value={home} onChange={function(e){setHome(e.target.value);}}>{frs.map(function(f){return (<option key={f.id} value={f.id}>{label(f.id)}</option>);})}</Select><Select value={away} onChange={function(e){setAway(e.target.value);}}>{frs.map(function(f){return (<option key={f.id} value={f.id}>{label(f.id)}</option>);})}</Select><Input placeholder="Home score" type="number" value={hs} onChange={function(e){setHs(e.target.value);}}/><Input placeholder="Away score" type="number" value={as} onChange={function(e){setAs(e.target.value);}}/><div className="md:col-span-6"><PrimaryButton onClick={add}>Add Match</PrimaryButton></div></div><div className="rounded-2xl border overflow-auto" style={{maxHeight:360}}><table className="min-w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Year</th><th className="p-2">Week</th><th className="p-2">Home</th><th className="p-2">Away</th><th className="p-2">Score</th><th className="p-2"></th></tr></thead><tbody>{rows.map(function(m){ return (<tr key={m.id} className="border-b last:border-0"><td className="p-2">{m.year||''}</td><td className="p-2">{m.week||''}</td><td className="p-2">{label(m.homeFranchiseId)}</td><td className="p-2">{label(m.awayFranchiseId)}</td><td className="p-2">{(m.homeScore||0)}-{(m.awayScore||0)}</td><td className="p-2 text-right"><Button className="text-xs" onClick={function(){remove(m.id);}}>Remove</Button></td></tr>); })}{rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={6}>No matches yet.</td></tr>):null}</tbody></table></div></div>); }

function CloudSyncPanel(p){ const state=p.state,setState=p.setState; const cfg=(state.ui&&state.ui.cloud)||cloudDefaults(); const [form,setForm]=React.useState({url:cfg.supabaseUrl||"", key:cfg.anonKey||"", table:cfg.table||"leagues", id:cfg.leagueId||"main", enabled:!!cfg.enabled, write: cfg.commishWrite!==false}); const [status,setStatus]=React.useState(""); const clientRef=React.useRef(null); const chanRef=React.useRef(null); function save(){ setState(function(prev){ const s=deepClone(prev); s.ui=s.ui||{}; s.ui.cloud={enabled:form.enabled, supabaseUrl:form.url, anonKey:form.key, table:form.table, leagueId:form.id, commishWrite:form.write, lastPulled:cfg.lastPulled||0}; return s; }); setStatus("Saved"); } function headers(){ return {apikey: form.key, Authorization:"Bearer "+form.key, "Content-Type":"application/json"}; } function pushNow(){ if(!form.url||!form.key||!form.table||!form.id){ setStatus("Missing fields"); return; } if(!(state.ui&&state.ui.commishUnlocked)&&form.write){ setStatus("Unlock commissioner first"); return; } const clean={...state, ui:{...state.ui, commishUnlocked:false}}; const body=[{id:form.id, state: clean, updated_at: new Date().toISOString()}]; fetch(form.url.replace(/\/$/,"")+"/rest/v1/"+form.table,{ method:"POST", headers:{...headers(), Prefer:"resolution=merge-duplicates,return=representation"}, body: JSON.stringify(body)}).then(function(r){ if(!r.ok){ return r.text().then(function(t){ throw new Error(t||("HTTP "+r.status)); }); } const ct=r.headers.get('content-type')||''; if(ct.indexOf('application/json')>=0){ return r.json(); } return r.text(); }).then(function(){ setStatus("Pushed"); }).catch(function(e){ setStatus("Error "+String(e).slice(0,140)); }); } function pullNow(){ if(!form.url||!form.key||!form.table||!form.id){ setStatus("Missing fields"); return; } const u=form.url.replace(/\/$/,"")+"/rest/v1/"+form.table+"?id=eq."+encodeURIComponent(form.id)+"&select=state,updated_at"; fetch(u,{headers:headers()}).then(function(r){ return r.ok? r.json() : r.text().then(function(t){throw new Error(t);}); }).then(function(rows){ if(rows&&rows[0]&&rows[0].state){ setState(function(prev){ const remote=rows[0].state; const s=deepClone(remote); s.ui=prev.ui||{}; s.ui.cloud={enabled:form.enabled, supabaseUrl:form.url, anonKey:form.key, table:form.table, leagueId:form.id, commishWrite:form.write, lastPulled:Date.now()}; return s; }); setStatus("Pulled"); } else { setStatus("No row"); } }).catch(function(e){ setStatus("Error "+String(e).slice(0,140)); }); } function testConn(){ if(!form.url||!form.key){ setStatus("Enter URL and key"); return; } fetch(form.url.replace(/\/$/,"")+"/rest/v1/",{headers:headers()}).then(function(r){ setStatus(r.ok?"OK":"HTTP "+r.status); }).catch(function(e){ setStatus("Error "+String(e).slice(0,140)); }); }
  React.useEffect(function(){ if(!form.enabled) return; var stop=false; import('@supabase/supabase-js').then(function(mod){ if(stop) return; var client=mod.createClient(form.url, form.key); clientRef.current=client; var ch=client.channel("leagues_"+form.table+"_"+form.id); chanRef.current=ch; ch.on("postgres_changes",{event:"*", schema:"public", table: form.table, filter:"id=eq."+form.id},function(payload){ var row=payload&&payload.new; if(row&&row.state){ setState(function(prev){ var s=deepClone(row.state); s.ui=prev.ui||{}; s.ui.cloud={enabled:true, supabaseUrl:form.url, anonKey:form.key, table:form.table, leagueId:form.id, commishWrite:form.write, lastPulled:Date.now()}; return s; }); setStatus("Synced"); } }).subscribe(); }).catch(function(){ var t=setInterval(function(){ pullNow(); },5000); chanRef.current={t:t}; }); return function(){ stop=true; try{ if(chanRef.current&&chanRef.current.t) clearInterval(chanRef.current.t); if(clientRef.current&&chanRef.current&&clientRef.current.removeChannel) clientRef.current.removeChannel(chanRef.current); }catch(e){} }; },[form.enabled, form.url, form.key, form.table, form.id]);
  return (<div className="grid gap-2"><div className="grid md:grid-cols-2 gap-2"><Input placeholder="Supabase URL" value={form.url} onChange={function(e){setForm({...form,url:e.target.value});}}/><Input placeholder="Anon public key" value={form.key} onChange={function(e){setForm({...form,key:e.target.value});}}/><Input placeholder="Table (default leagues)" value={form.table} onChange={function(e){setForm({...form,table:e.target.value});}}/><Input placeholder="League ID (e.g., main)" value={form.id} onChange={function(e){setForm({...form,id:e.target.value});}}/></div><div className="flex flex-wrap gap-2 items-center"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={function(e){ var enabled=e.target.checked; setForm({...form,enabled:enabled}); setState(function(prev){ var s=deepClone(prev); s.ui=s.ui||{}; s.ui.cloud={ enabled: enabled, supabaseUrl: form.url, anonKey: form.key, table: form.table, leagueId: form.id, commishWrite: form.write, lastPulled: (s.ui.cloud&&s.ui.cloud.lastPulled)||0 }; return s; }); }}/>
Enable sync</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.write} onChange={function(e){setForm({...form,write:e.target.checked});}}/>Commish can write</label><Button onClick={save}>Save</Button><Button onClick={pullNow}>Pull Now</Button><PrimaryButton onClick={pushNow}>Push Now</PrimaryButton><Button onClick={testConn}>Test</Button><div className="text-xs text-gray-500">{status}</div></div></div>); }

// --- Runtime sanity checks (lightweight) ---
function runDevTests(){
  try{
    const nt=parseNameTeamBye("Courtland Sutton DEN (9)");
    console.assert(nt.name==="Courtland Sutton" && nt.team==="DEN" && nt.bye===9, "parseNameTeamBye failed");
    console.assert(estimateProjection('RB',1) > estimateProjection('RB',50), "estimateProjection ordering failed");
    const s=seedLeague();
    // simple game result
    const h=s.teams[0].id, a=s.teams[1].id;
    s.schedule=[{week:1,games:[{home:h,away:a,homeScore:100,awayScore:90,final:true}]}];
    const s2=recomputeTeamTotals(s);
    const th=teamById(s2,h), ta=teamById(s2,a);
    console.assert(th.wins===1 && ta.losses===1 && th.pointsFor===100 && ta.pointsAgainst===100, "recomputeTeamTotals failed");
  }catch(e){ console.warn("FFL dev tests", e); }
}
if(typeof window!=="undefined" && !window.__FFL_DEV_TESTED__){ window.__FFL_DEV_TESTED__=true; try{ runDevTests(); }catch(e){} }

// --- Helpers used by several admin panels ---
function recomputeTeamTotals(state){
  const s=deepClone(state);
  // Reset
  (s.teams||[]).forEach(function(t){ t.wins=0; t.losses=0; t.pointsFor=0; t.pointsAgainst=0; });
  // Aggregate from scored games
  for(const wk of (s.schedule||[])){
    for(const g of (wk.games||[])){
      const th=teamById(s,g.home), ta=teamById(s,g.away);
      if(!th||!ta) continue;
      const hs=Number(g.homeScore)||0; const as=Number(g.awayScore)||0;
      th.pointsFor += hs; th.pointsAgainst += as;
      ta.pointsFor += as; ta.pointsAgainst += hs;
      if(g.final){ if(hs>as) th.wins++; else if(as>hs) ta.wins++; }
    }
  }
  return s;
}

// --- Teams Admin (add/remove teams & managers) ---
function TeamAdmin(p){
  const state=p.state, setState=p.setState;
  const [name,setName]=React.useState("");
  const [manager,setManager]=React.useState("");
  function add(){
    if(!name.trim()) return;
    setState(function(prev){
      const s=deepClone(prev);
      const id='t'+Date.now();
      s.teams.push({ id:id, name:name.trim(), manager:manager.trim(), roster:newEmptyRoster(s.settings.rosterSlots), wins:0, losses:0, pointsFor:0, pointsAgainst:0 });
      ensureFranchises(s);
      return s;
    });
    setName(""); setManager("");
  }
  function removeTeam(id){
    if(!id) return; if(!window.confirm('Remove this team? Games with this team will be deleted.')) return;
    setState(function(prev){
      let s=deepClone(prev);
      // unlink franchise if linked
      if(s.history&&Array.isArray(s.history.franchises)){
        const f=s.history.franchises.find(function(fr){return fr.currentTeamId===id;});
        if(f){ f.currentTeamId=null; f.active=false; }
      }
      // remove from schedule
      s.schedule=(s.schedule||[]).map(function(w){ return {week:w.week, games:(w.games||[]).filter(function(g){return g.home!==id && g.away!==id;})}; });
      // drop team
      s.teams=s.teams.filter(function(t){return t.id!==id;});
      s=recomputeTeamTotals(s);
      return s;
    });
  }
  const rows=state.teams||[];
  return (
    <div className="grid gap-2">
      <div className="grid md:grid-cols-3 gap-2 items-end">
        <Input placeholder="Team name" value={name} onChange={function(e){setName(e.target.value);}}/>
        <Input placeholder="Manager" value={manager} onChange={function(e){setManager(e.target.value);}}/>
        <PrimaryButton onClick={add}>Add Team</PrimaryButton>
      </div>
      <div className="rounded-2xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Team</th><th className="p-2">Manager</th><th className="p-2">Record</th><th className="p-2"></th></tr></thead>
          <tbody>
            {rows.map(function(t){
              return (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="p-2">{t.name}</td>
                  <td className="p-2">{t.manager}</td>
                  <td className="p-2">{(t.wins||0)}-{(t.losses||0)}</td>
                  <td className="p-2 text-right"><Button className="text-xs" onClick={function(){removeTeam(t.id);}}>Remove</Button></td>
                </tr>
              );
            })}
            {rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={4}>No teams yet.</td></tr>):null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Team Editor (rename team & manager, does not touch history entries) ---
function TeamEditor(p){
  const state=p.state, setState=p.setState;
  function renameTeam(id){
    const t=teamById(state,id); if(!t) return;
    const v=prompt('New team name', t.name);
    if(v && v.trim()){
      setState(function(prev){ const s=deepClone(prev); const tt=teamById(s,id); if(tt) tt.name=v.trim(); return s; });
    }
  }
  function renameMgr(id){
    const t=teamById(state,id); if(!t) return;
    const v=prompt('New manager name', t.manager||'');
    if(v!=null){ setState(function(prev){ const s=deepClone(prev); const tt=teamById(s,id); if(tt) tt.manager=v.trim(); return s; }); }
  }
  const rows=state.teams||[];
  return (
    <div className="rounded-2xl border overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-gray-500"><tr><th className="p-2">Team</th><th className="p-2">Manager</th><th className="p-2"></th></tr></thead>
        <tbody>
          {rows.map(function(t){ return (
            <tr key={t.id} className="border-b last:border-0">
              <td className="p-2">{t.name}</td>
              <td className="p-2">{t.manager||''}</td>
              <td className="p-2 text-right">
                <div className="flex gap-2 justify-end">
                  <Button className="text-xs" onClick={function(){renameTeam(t.id);}}>Rename Team</Button>
                  <Button className="text-xs" onClick={function(){renameMgr(t.id);}}>Rename Manager</Button>
                </div>
              </td>
            </tr>
          ); })}
          {rows.length===0?(<tr><td className="p-2 text-sm text-gray-500" colSpan={3}>No teams.</td></tr>):null}
        </tbody>
      </table>
    </div>
  );
}

function CommissionerTab(p){ const state=p.state,setState=p.setState; const hash=(state.settings&&state.settings.commissioner&&state.settings.commissioner.passwordHash)||null; const unlocked=!!(state.ui&&state.ui.commishUnlocked); const [pw,setPw]=useState(""); const [pw2,setPw2]=useState(""); const [oldPw,setOldPw]=useState(""); function doUnlock(){ if(!hash){ if(!pw||pw!==pw2) return; setState(function(prev){ const s=deepClone(prev); if(!s.settings.commissioner) s.settings.commissioner={}; s.settings.commissioner.passwordHash=hashLite(pw); s.ui.commishUnlocked=true; return s; }); setPw(""); setPw2(""); } else { if(!pw) return; if(hashLite(pw)!==hash){ alert("Incorrect password"); return; } setState(function(prev){ const s=deepClone(prev); s.ui.commishUnlocked=true; return s; }); setPw(""); } } function doLock(){ setState(function(prev){ const s=deepClone(prev); s.ui.commishUnlocked=false; return s; }); } function doReset(){ if(!unlocked) return; if(hash && hashLite(oldPw)!==hash){ alert("Incorrect current password"); return; } if(!pw||pw!==pw2){ alert("Passwords must match"); return; } setState(function(prev){ const s=deepClone(prev); if(!s.settings.commissioner) s.settings.commissioner={}; s.settings.commissioner.passwordHash=hashLite(pw); s.ui.commishUnlocked=true; return s; }); setOldPw(""); setPw(""); setPw2(""); }
  return (<div className="grid gap-4">
    <Card>
      <CardHeader title="Commissioner" sub="Unlock to access admin tools"/>
      <CardBody>
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="rounded-2xl border p-3">
            <div className="text-sm font-medium mb-2">{unlocked? 'Status: Unlocked':'Status: Locked'}</div>
            {!unlocked? (
              <div className="grid gap-2">
                {!hash? (<>
                  <Input type="password" placeholder="Set password" value={pw} onChange={function(e){setPw(e.target.value);}}/>
                  <Input type="password" placeholder="Confirm password" value={pw2} onChange={function(e){setPw2(e.target.value);}}/>
                  <PrimaryButton onClick={doUnlock}>Set & Unlock</PrimaryButton>
                </>) : (<>
                  <Input type="password" placeholder="Enter password" value={pw} onChange={function(e){setPw(e.target.value);}}/>
                  <PrimaryButton onClick={doUnlock}>Unlock</PrimaryButton>
                </>)}
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex gap-2 items-center"><PrimaryButton onClick={doLock}>Lock</PrimaryButton><span className="text-xs text-gray-500">You can still browse; admin tools are hidden when locked.</span></div>
                <div className="mt-2 text-sm font-medium">Reset Password</div>
                {hash? (<Input type="password" placeholder="Current password" value={oldPw} onChange={function(e){setOldPw(e.target.value);}}/>):null}
                <Input type="password" placeholder="New password" value={pw} onChange={function(e){setPw(e.target.value);}}/>
                <Input type="password" placeholder="Confirm new password" value={pw2} onChange={function(e){setPw2(e.target.value);}}/>
                <Button onClick={doReset}>Save New Password</Button>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
    {unlocked ? (<>
      <Card><CardHeader title="Cloud Sync" sub="Sync via Supabase; enable and save"/><CardBody><CloudSyncPanel state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Teams / Managers" sub="Add teams and managers"/><CardBody><TeamAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Edit Team / Manager Names" sub="Rename without affecting history records"/><CardBody><TeamEditor state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Franchises (Legacy / Link)" sub="Create legacy franchises not in the current league or link to current teams"/><CardBody><FranchiseAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Roster Editor" sub="Search free agents and add to rosters"/><CardBody><RosterAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Free Agent CSV Import" sub="FantasyPros top 300 supported. Use Replace to overwrite the current pool."/><CardBody><CSVImportAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Schedule & Results" sub="Create games, enter scores, remove games"/><CardBody><ScheduleAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="League History (Admin)" sub="Add season records per franchise"/><CardBody><SeasonAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Match History (Admin)" sub="Add past years matchups by franchise"/><CardBody><MatchesAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Feed Admin"/><CardBody><FeedAdmin state={state} setState={setState}/></CardBody></Card>
      <Card><CardHeader title="Past Champions"/><CardBody><ChampionAdmin state={state} setState={setState}/></CardBody></Card>
    </>) : (<Card><CardBody><div className="text-sm text-gray-600">Unlock to reveal commissioner tools.</div></CardBody></Card>)}
  </div>);
}
