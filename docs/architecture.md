# Architecture

Diagrams are Mermaid and must stay in sync with [decisions.md](decisions.md) and the code.

## 1. Factory overview

```mermaid
flowchart LR
    U[Nawaf] -->|task / ticket| MS[Main Claude Code session<br/>= orchestrator]
    MS -->|stage skills| ST[investigate · plan · build · verify · review · deliver · remember]
    ST -->|wide search| INV[investigator agent]
    ST -->|routed, parallel| REV[code · db · security · ui reviewers]
    ST -->|deterministic| SC[job.mjs · gate.mjs · route.mjs]
    MS -->|✋ plan approval<br/>✋ delivery approval| U
    ST --> MR[MR / PR via repo delivery skill]
    MR -->|human review + merge| TEAM[Team reviewer]
```

## 2. Component architecture

```mermaid
flowchart TB
    subgraph MKT["C:\\WORK\\software-factory (plugin marketplace, git repo)"]
        subgraph DF["dotnet-factory plugin"]
            PR[principles.md]
            HK[hooks.json<br/>SessionStart · PreToolUse]
            G[guard.mjs]
            SCX[session-context.mjs]
            J[job.mjs + jobs.mjs]
            DB[dashboard.mjs + dashboard/index.html<br/>read-only kanban :4777]
            GT[gate.mjs]
            RT[route.mjs + config/routing.json]
            SK1[skills: factory, discover, investigate,<br/>plan, build, verify, review, deliver, remember, dashboard]
            AG1[agents: investigator, code-reviewer,<br/>db-reviewer, security-reviewer]
        end
        subgraph UF["ui-factory plugin"]
            SK2[skills: ui-factory, ui-discover,<br/>ui-build, ui-verify]
            AG2[agent: ui-reviewer]
        end
    end
    subgraph REPO["Each repository"]
        P[.factory/profile.md]
        UP[.factory/ui-profile.md]
        CJ[.factory/checks.json · guard.json · routing.json]
        K[.factory/knowledge/*.md + INDEX.md]
        JB[.factory/jobs/&lt;id&gt;/*]
        GR[graphify-out/]
        AM[AGENTS.md / CLAUDE.md — team-owned]
    end
    HK --> G & SCX
    SCX --> PR
    SCX -.reads.-> P & K & JB
    G -.reads.-> CJ
    GT -.reads.-> CJ
    GT --> JB
    RT --> JB
    SK1 --> J & GT & RT
    SK2 --> SK1
    DB -.reads.-> JB
    J -->|init registers repo| REG[(~/.software-factory/repos.json)]
    DB -.reads.-> REG
    AG1 -.query.-> GR
```

## 3. Agent interaction (one job)

```mermaid
sequenceDiagram
    actor N as Nawaf
    participant O as Orchestrator (main session)
    participant I as investigator
    participant S as scripts
    participant R as reviewers (parallel)
    N->>O: task
    O->>S: job.mjs new
    O->>I: precise question(s)
    I-->>O: ANSWER + file:line evidence
    O->>O: context.md, plan.md (DRAFT)
    O->>N: ✋ approve plan?
    N-->>O: yes
    O->>O: build (edits + build.md)
    O->>S: gate.mjs --job
    S-->>O: GATE: PASS | FAIL
    O->>S: route.mjs --job
    S-->>O: ROUTE: code, db, ...
    O->>R: review round n
    R-->>O: VERDICT lines (review-*.md)
    O->>N: ✋ deliver?
    N-->>O: yes
    O->>O: deliver via repo MR skill → delivery.md
```

## 4. Feature development lifecycle

```mermaid
flowchart LR
    A[task.md] --> B[investigate<br/>context.md: IMPACT MAPPED]
    B --> C[plan.md DRAFT]
    C --> D{✋ user approves?}
    D -- changes --> C
    D -- yes --> E[build + evidence<br/>build.md]
    E --> F{gate}
    F -- FAIL ≤3 rounds --> E
    F -- PASS --> G[route + review]
    G -- CHANGES --> E
    G -- PASS --> H{✋ deliver?}
    H -- yes --> I[commit · push · MR<br/>delivery.md]
    I --> K[remember<br/>if something new was learned]
```

## 5. Bug investigation lifecycle

```mermaid
flowchart TB
    A[bug report] --> K{knowledge note<br/>exists?}
    K -- yes --> V[verify note still true]
    K -- no --> G[graphify query / explain]
    V --> T
    G --> T[trace request path<br/>controller → service → data]
    T --> R{reproduced?}
    R -- yes --> RC[root cause file:line<br/>+ blast radius]
    R -- no --> NR[ranked hypotheses + what was tried]
    RC --> P[plan the minimal fix]
    NR --> Q[ask the user one question]
    P --> Rest[build → gate → review → deliver]
    RC --> M[remember: root cause note]
```

## 6. Testing and review lifecycle

```mermaid
flowchart LR
    B[build.md evidence<br/>per acceptance criterion] --> G[gate.mjs<br/>checks.json + protected paths]
    G -->|PASS| RT[route.mjs from diff]
    RT --> C[code-reviewer — always]
    RT --> D[db-reviewer — migrations/SQL/EF]
    RT --> S[security-reviewer — auth/payment/upload/...]
    RT --> U[ui-reviewer — views/styles/scripts]
    C & D & S & U --> V{all PASS?}
    V -- no --> FIX[build: fix findings only] --> G
    V -- yes --> OK[ready for ✋ delivery]
```

## 7. Repository knowledge architecture

```mermaid
flowchart TB
    subgraph Repo[Per repository]
        PF[profile.md — shape of the repo]
        UIP[ui-profile.md — design system as it is]
        KN[knowledge/ — rules, traps, root causes, decisions]
        GRF[graphify-out/ — structural graph]
        JOBS[jobs/ — audit trail per task]
    end
    MEM[Claude memory — user preferences, cross-repo]
    TEAM[AGENTS.md / Docs — team knowledge, committed by choice]
    OBS[Obsidian — optional export]
    JOBS -->|remember skill| KN
    KN -.user decides.-> TEAM
    KN -.on request.-> OBS
    PF --> Sessions((every session))
    KN --> Sessions
    GRF --> Sessions
    MEM --> Sessions
```

## 8. Global vs project configuration

```mermaid
flowchart LR
    subgraph Global["Global (plugins, same everywhere)"]
        Pr[principles] --- Gd[guard defaults<br/>protected branches, DB, secrets]
        Gd --- Rt[default routing]
        Rt --- Sk[stage skills + agents]
    end
    subgraph Project["Project (.factory/, per repo)"]
        Pf[profile.md / ui-profile.md]
        Ck[checks.json — the gate]
        Gj[guard.json — extra protected branches, allow list]
        Rj[routing.json — extra routing rules]
    end
    Global -->|defaults| Project
    Project -->|overrides & facts| Run((a job in this repo))
    Global --> Run
```

## 9. UI lifecycle

```mermaid
flowchart LR
    A[UI task] --> P0{ui-profile.md?}
    P0 -- no --> UD[ui-discover]
    P0 -- yes --> T{track}
    UD --> T
    T -- UI bug --> RP[ui-verify reproduce<br/>baseline evidence]
    RP --> INV[investigate]
    T -- new / change --> INV
    INV --> PL[plan + UI acceptance criteria]
    PL --> MK[mockup with the app's own CSS<br/>new screens]
    MK --> AP{✋ approve}
    PL --> AP
    AP --> UB[ui-build]
    UB --> GT[gate]
    GT --> UV[ui-verify<br/>desktop/phone · RTL/LTR · states · console/network]
    UV --> RV[review: ui-reviewer + routed others]
    RV --> DL{✋ deliver}
```
