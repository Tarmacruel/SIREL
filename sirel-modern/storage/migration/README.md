Esta pasta armazena os artefatos locais da sincronizacao entre o legado Django e a Beta 2.0.

Arquivos gerados:

- `legacy_snapshot.json`: exportacao manual completa.
- `legacy_sync_snapshot.json`: ultimo snapshot usado pelo pipeline incremental.
- `legacy_sync_state.json`: estado da ultima sincronizacao bem-sucedida.

Esses arquivos sao locais e nao devem ser versionados.
