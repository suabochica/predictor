Steps
-----

Use proper python version

```sh
pyenv local
```

Install python dependencies

```sh
pip install -r requirements.txt
```

Launch
------

```sh
uvicorn app.main:app --reload
```

open browser on http://127.0.0.1:8000/