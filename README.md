# 🔮 Predictor

 Project to manage tournaments and teams predictions with score rules and a leaderboards.

 ## ✍ Prompt

 The initial prompt on claude was:

 ```txt
Claude in this repository we want to create a tournament score predictor whose use case will be the FIFA world cup 2026. In the frontend we will use JavaScript with TypeScript under the AstroJS meta framework, use pnpm as package manager and jest for unit testing. On the backend we will use Python with the FastAPI framework. We will enable a form to enter the scores, a section with the rules of how  the user get points and a leader board with the scores of the user. The app will be initially for 15 user so we can mock their information.
 ```

## 🛂 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                               │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ domain.com   │
     │   (root)     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐     No session      ┌──────────────┐
     │   Gateway    │ ──────────────────► │    Login     │
     │   App        │                     │    Page     │
     └──────┬───────┘                     └──────┬───────┘
            │                                    │
            │ Has session                        │ Auth success
            ▼                                    │
     ┌──────────────┐◄───────────────────────────┘
     │  Dashboard   │
     │ (App Select) │
     └──────┬───────┘
            │
            │ User chooses app
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌────────┐     ┌──────────┐
│ /polla │     │ /fantasy │
│  App   │     │   App    │
└────────┘     └──────────┘
    │               │
    │ Shared Supabase Session
    │               │
    └───────┬───────┘
            │
            ▼
     ┌──────────────┐
     │   Supabase   │
     │   (Auth + DB)│
     └──────────────┘
```

 ## 🧞 Commands

```bash
# Install dependencies
pnpm install

# Run all apps
pnpm dev

# Or individually
pnpm dev:gateway  # http://localhost:4321
pnpm dev:polla    # http://localhost:4322
pnpm dev:fantasy  # http://localhost:4323
```

 ## 🤖 AI Use

 The agent code that we are using:

 - [Code Claude](https://claude.ai)
 - [Opencode](https://opencode.ai/docs/)

The list of LLM used:

- cloude-sonnet
- DeepSeek V4 Pro (Go subscription required)

 The recommended IDE & Editor is: 
 
 - [VS Code](https://code.visualstudio.com/)

