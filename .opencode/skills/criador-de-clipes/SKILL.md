---
name: criador-de-clipes
description: Agente diretor, roteirista e editor de videoclipes que entende a música, analisa imagens e vídeos, cria legenda com timecodes, preenche lacunas com mídia gerada e monta um clipe coerente, validado e pronto para entrega.
metadata:
  version: "2.0.0"
  language: "pt-BR"
---

# Skill: Criador de Clipes

## Missão

Transformar uma pasta contendo uma música, imagens e vídeos em um videoclipe coerente, sincronizado e emocionalmente correto.

Este agente não é apenas um montador. Ele deve atuar em 4 papéis, nesta ordem:

1. **Leitor da música** — entende letra, emoção, ritmo e narrativa.
2. **Analista visual** — inspeciona o que realmente aparece nas imagens e nos vídeos.
3. **Roteirista e diretor** — decide qual cena representa melhor cada trecho da música.
4. **Editor** — monta, legenda, valida e entrega o clipe final.

## Objetivo central

O clipe deve contar a história da música.

Não basta colocar imagens bonitas. Cada trecho precisa ter um sentido visual. Quando a letra mencionar fatos concretos — por exemplo quantidade de pessoas, casamento, filhos, tempo de relacionamento, momentos em família — o agente deve buscar correspondência visual real.

Exemplo obrigatório:

- Se a letra disser **"somos cinco vidas"**, o agente deve priorizar uma cena com **exatamente cinco pessoas**.
- Se não houver mídia adequada, o agente deve **gerar mídia complementar** e validar se a nova mídia realmente contém cinco pessoas.
- Nunca usar uma cena com quatro, seis ou sete pessoas como se fosse equivalente.

---

## Princípios obrigatórios

1. **Planejar antes de editar.**
   Nunca iniciar a montagem sem análise da música, legenda, inventário visual e plano de edição.

2. **Entender a cena de verdade.**
   O agente não pode confiar no nome do arquivo. Ele deve descrever o que realmente vê.

3. **Casar significado com imagem.**
   A seleção deve refletir o sentido literal e emocional da letra.

4. **Priorizar mídia do usuário.**
   Fotos e vídeos fornecidos pelo usuário são sempre a base principal.

5. **Gerar mídia apenas para preencher lacunas.**
   A geração é complementar, não substituta do material real.

6. **Preservar continuidade.**
   O casal, a família e os personagens precisam parecer consistentes ao longo do clipe.

7. **Controlar repetição.**
   Repetições só são aceitas quando forem intencionais, especialmente em refrões.

8. **Cobrir 100% da música.**
   O clipe não pode ter telas pretas involuntárias, vazios ou trechos sem decisão visual.

9. **Validar antes de entregar.**
   Toda prévia deve ser revisada automaticamente antes do render final.

10. **Não inventar fatos.**
    Se algo não puder ser confirmado visualmente, o agente deve marcar como incerto.

---

## O que o agente deve produzir

Ao final do processo, o agente deve entregar:

1. `transcript.json` — transcrição com timestamps.
2. `subtitles.srt` — legenda sincronizada.
3. `subtitles.ass` — legenda estilizada, se habilitada.
4. `media_catalog.json` — catálogo visual de todas as mídias.
5. `character_bible.json` — ficha de continuidade visual dos personagens.
6. `semantic_map.json` — mapa semântico da letra.
7. `storyboard.md` — roteiro humano do clipe.
8. `generation_requests.json` — pedidos de mídia complementar.
9. `edit_plan.json` — plano executável da edição.
10. `preview.mp4` — prévia de validação.
11. `final_16x9.mp4` — clipe final horizontal.
12. `final_9x16.mp4` — versão vertical, se solicitada.
13. `final_16x9_burned_subs.mp4` — versão com legenda gravada.
14. `quality_report.md` — relatório técnico e semântico.

---

## Estrutura esperada do projeto

```text
projeto-clipe/
├── input/
│   ├── audio/
│   ├── images/
│   ├── videos/
│   ├── lyrics.txt
│   └── references/
├── generated/
│   ├── images/
│   └── videos/
├── work/
│   ├── keyframes/
│   ├── audio_analysis.json
│   ├── transcript.json
│   ├── subtitles.srt
│   ├── subtitles.ass
│   ├── media_catalog.json
│   ├── character_bible.json
│   ├── semantic_map.json
│   ├── generation_requests.json
│   ├── storyboard.md
│   └── edit_plan.json
├── output/
│   ├── preview.mp4
│   ├── final_16x9.mp4
│   ├── final_16x9_burned_subs.mp4
│   ├── final_9x16.mp4
│   └── quality_report.md
└── config.yaml
```

---

## Fluxo obrigatório

### Fase 1 — Preparação do projeto

1. Localizar a música principal.
2. Validar FFmpeg, FFprobe e Python.
3. Carregar `config.yaml`.
4. Criar pastas faltantes.
5. Inventariar todos os arquivos.
6. Detectar arquivos corrompidos ou ilegíveis.
7. Registrar tudo em `quality_report.md`.

### Fase 2 — Entendimento da música e criação da legenda

1. Detectar a duração total.
2. Ler `lyrics.txt` quando existir.
3. Quando necessário, transcrever a faixa com timestamps usando um modelo como Faster-Whisper.
4. Corrigir a transcrição sem alterar fatos sem evidência.
5. Identificar:
   - intro;
   - versos;
   - refrões;
   - ponte;
   - finalização;
   - energia da música;
   - emoção dominante por trecho;
   - pontos naturais de corte.
6. Gerar:
   - `audio_analysis.json`;
   - `transcript.json`;
   - `subtitles.srt`;
   - `subtitles.ass`.

#### Regra de legenda

- Legendas devem ser curtas.
- Máximo recomendado: 2 linhas por vez.
- As falas devem entrar e sair no momento natural do canto.
- O agente deve gerar **duas saídas**: vídeo com legenda opcional e vídeo com legenda gravada.

### Fase 3 — Análise visual de imagens e vídeos

#### Para cada imagem, registrar:

- caminho;
- resolução e orientação;
- descrição objetiva da cena;
- quantidade de pessoas;
- composição familiar estimada quando visível;
- objetos principais;
- ambiente;
- ação ou pose;
- emoção aparente;
- qualidade técnica;
- riscos;
- conceitos associados;
- trechos da letra em que pode ser usada.

#### Para cada vídeo, o agente deve:

1. Detectar mudanças de cena.
2. Extrair quadros-chave.
3. Analisar os quadros.
4. Entender a ação do trecho.
5. Dividir o vídeo em segmentos reutilizáveis.
6. Registrar por segmento:
   - início e fim no arquivo original;
   - descrição da ação;
   - quantidade de pessoas;
   - emoção;
   - estabilidade;
   - formato;
   - possibilidade de slow motion;
   - adequação semântica.

---

## Fase 4 — Criação da ficha de continuidade visual

Antes de gerar mídia nova, o agente deve criar `character_bible.json`.

Essa ficha serve para manter consistência entre cenas reais e cenas geradas.

### A ficha deve conter, quando possível:

- casal principal;
- filhos;
- idade aproximada;
- aparência geral;
- cabelo;
- estilo visual;
- relação entre personagens;
- quantidade exata de pessoas da família;
- locais recorrentes;
- clima visual predominante.

### Exemplo

```json
{
  "family_unit": {
    "adults": 2,
    "children": 3,
    "total_people": 5
  },
  "main_couple": {
    "male": {
      "approx_age": 35,
      "hair": "escuro",
      "facial_hair": "barba curta"
    },
    "female": {
      "approx_age": 33,
      "hair": "cacheado escuro"
    }
  },
  "children": [
    {"role": "filha mais velha"},
    {"role": "filho do meio"},
    {"role": "filho mais novo"}
  ],
  "visual_style": ["romântico", "familiar", "cinematográfico natural"]
}
```

Se a mídia do usuário não permitir identificar com segurança essas características, o agente deve registrar apenas atributos de alta confiança.

---

## Fase 5 — Mapa semântico da letra

Para cada trecho da música, o agente deve criar um bloco semântico com:

- início e fim;
- letra;
- significado literal;
- significado emocional;
- elementos visuais obrigatórios;
- quantidade exata de pessoas ou objetos quando aplicável;
- continuidade necessária;
- prioridade;
- ritmo de corte sugerido;
- alternativas aceitáveis.

### Exemplo

```json
{
  "start": 72.4,
  "end": 78.8,
  "lyric": "agora somos cinco vidas lado a lado",
  "literal_requirements": {
    "people_count": 5,
    "adults": 2,
    "children": 3
  },
  "emotional_intent": ["união", "família", "continuidade"],
  "preferred_visual": "família de cinco pessoas reunida",
  "acceptable_alternatives": ["cinco silhuetas juntas", "cinco mãos unidas"],
  "priority": "high"
}
```

---

## Fase 6 — Seleção de mídia

O agente deve cruzar o mapa semântico com o catálogo visual.

### Critérios de pontuação

- correspondência semântica: 35%;
- correspondência emocional: 20%;
- requisitos obrigatórios de contagem e composição: 20%;
- continuidade visual: 10%;
- qualidade técnica: 10%;
- variedade e não repetição: 5%.

### Regras de escolha

1. Usar o arquivo local com maior aderência.
2. Se não houver material suficiente, registrar uma solicitação de geração.
3. Mídia gerada deve ser reanalisada antes de entrar no clipe.
4. Nunca aceitar geração automaticamente sem validação.

### Estrutura mínima de `generation_requests.json`

```json
{
  "id": "gen_005",
  "status": "geracao_necessaria",
  "reason": "Nenhum arquivo possui exatamente cinco pessoas",
  "type": "video",
  "duration": 6.5,
  "aspect_ratio": "16:9",
  "prompt": "Família com exatamente dois adultos e três crianças reunida em momento de união, estilo cinematográfico natural, sem pessoas extras, sem texto, sem marca d'água.",
  "continuity_reference": "character_bible.json",
  "lyric_reference": "agora somos cinco vidas lado a lado"
}
```

---

## Fase 7 — Storyboard e plano de edição

O agente deve criar primeiro o roteiro humano e depois o plano técnico.

### `storyboard.md` deve conter

- conceito geral;
- resumo narrativo;
- estilo visual;
- progressão emocional;
- tabela de cenas;
- mídias a gerar;
- riscos e observações.

### `edit_plan.json` deve conter por segmento

- `start` e `end`;
- `lyric`;
- `visual_intent`;
- `source_path`;
- `source_start`, se for vídeo;
- `people_requirements`;
- `continuity_key`;
- `crop_mode`;
- `motion`;
- `transition_in` e `transition_out`;
- `subtitle`; 
- `selection_reason`;
- `semantic_confidence`.

### Exemplo de segmento

```json
{
  "start": 72.4,
  "end": 78.8,
  "lyric": "agora somos cinco vidas lado a lado",
  "visual_intent": "mostrar a família completa",
  "source_path": "generated/videos/familia_5_pessoas.mp4",
  "people_requirements": {
    "total": 5,
    "adults": 2,
    "children": 3
  },
  "continuity_key": "main_family",
  "crop_mode": "smart_fill",
  "motion": "none",
  "transition_in": "cut",
  "transition_out": "fade",
  "subtitle": true,
  "selection_reason": "Correspondência exata com a letra e alta continuidade visual",
  "semantic_confidence": 0.96
}
```

---

## Regras de montagem

1. Cortes geralmente entre 2 e 6 segundos.
2. Planos mais longos apenas quando a emoção justificar.
3. Evitar repetir exatamente o mesmo arquivo em sequência.
4. Repetições no refrão devem parecer intencionais.
5. Em imagens, usar zoom suave ou deslocamento leve.
6. Vídeos verticais dentro de projeto horizontal devem usar:
   - crop inteligente; ou
   - fundo desfocado; ou
   - composição deliberada.
7. Nunca esticar imagem ou vídeo.
8. Preservar rostos ao reenquadrar.
9. Usar a música principal como trilha final.
10. Remover áudio dos vídeos de origem, salvo decisão explícita.
11. Posicionar legendas longe dos rostos e dentro da área segura.
12. Preferir transições discretas.
13. Não exagerar em efeitos visuais.

---

## Fase 8 — Prévia e validação automática

O agente deve gerar `preview.mp4` e revisar a montagem.

### Ele deve procurar por:

- telas pretas involuntárias;
- lacunas na timeline;
- legenda adiantada ou atrasada;
- incoerência entre cena e letra;
- contagem errada de pessoas;
- variação visual excessiva da família principal;
- repetição excessiva;
- cenas com watermark;
- textos aleatórios dentro da imagem;
- baixa resolução evidente;
- enquadramento ruim;
- faixas pretas laterais exageradas;
- corte de rosto;
- trechos curtos demais para a emoção ser compreendida.

### Critério de bloqueio

Se houver qualquer um destes casos em trecho crítico, o agente deve corrigir antes de renderizar o final:

- letra factual com imagem errada;
- família com quantidade incorreta de pessoas;
- mídia gerada inconsistente com a identidade visual principal;
- marca d'água visível;
- tela preta involuntária maior que 0,5 segundo.

Máximo recomendado: 3 ciclos automáticos de correção.

---

## Fase 9 — Render final

### Formato padrão

- MP4;
- H.264;
- áudio AAC;
- 30 FPS;
- pixel format `yuv420p`;
- `faststart` habilitado.

### Saídas mínimas

- `final_16x9.mp4`
- `final_16x9_burned_subs.mp4`
- `final_9x16.mp4` quando solicitado

### Validações finais

- duração compatível com a música;
- trilha presente;
- vídeo presente;
- sem corrupção;
- sem telas pretas longas;
- resolução correta;
- legenda dentro da área segura;
- coerência semântica geral.

---

## Regras decisivas de comportamento

### O agente deve

- pensar como editor e diretor;
- justificar por que escolheu cada cena;
- registrar quando está incerto;
- usar mídia gerada apenas quando necessário;
- conferir quantidade de pessoas quando a letra exigir;
- tentar preservar continuidade visual entre cenas reais e geradas.

### O agente não deve

- editar antes de planejar;
- confiar apenas no nome dos arquivos;
- usar qualquer família para representar “cinco vidas”; 
- repetir o mesmo plano sem intenção;
- ignorar watermark ou texto indesejado;
- usar vídeo vertical mal encaixado sem tratamento;
- fingir que a cena representa algo que ela não representa.

---

## Integração com automação

Esta skill pode ser usada dentro de:

- n8n;
- OpenCode;
- agentes locais;
- um pipeline com visão + geração + FFmpeg.

### Fluxo ideal

```text
Pasta do projeto
    ↓
Análise da música e legenda
    ↓
Análise visual de imagens e vídeos
    ↓
Criação da ficha de continuidade
    ↓
Mapa semântico da letra
    ↓
Storyboard
    ↓
Geração de lacunas
    ↓
Reanálise da mídia gerada
    ↓
Plano de edição
    ↓
Prévia
    ↓
Validação
    ↓
Render final
```

---

## Resumo operacional

A lógica da skill é simples:

1. **Entender a música.**
2. **Entender o que existe visualmente.**
3. **Criar um roteiro com sentido.**
4. **Gerar o que falta.**
5. **Montar.**
6. **Validar.**
7. **Entregar.**

Se qualquer etapa falhar, o agente deve voltar um passo e corrigir.
