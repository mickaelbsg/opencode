# Criador de Clipes — instalação e uso

Esta skill foi pensada para um agente que cria videoclipes a partir de:

- uma música;
- uma pasta com imagens;
- uma pasta com vídeos;
- opcionalmente uma letra;
- opcionalmente referências visuais.

A ideia não é montar um vídeo aleatório. O agente deve agir como **diretor + roteirista + editor**.

Ele primeiro entende a música, depois entende o que existe nas mídias, depois cria o roteiro, preenche as lacunas com mídia gerada e só então monta o clipe.

---

## O que esta versão melhorou

Esta versão atualizada adiciona regras importantes:

- legenda sincronizada com timecodes;
- criação de `character_bible.json` para manter continuidade dos personagens;
- validação semântica forte, por exemplo: “cinco vidas” exige cinco pessoas;
- controle de repetição de cenas;
- tratamento correto de vídeos verticais em clipes horizontais;
- geração de duas saídas: com legenda opcional e com legenda gravada;
- bloqueio de cenas com watermark, texto indesejado ou composição errada;
- prioridade total para fotos e vídeos do usuário;
- geração complementar apenas quando faltar material.

---

## Requisitos

- Python 3.10 ou superior
- FFmpeg e FFprobe
- Faster-Whisper ou outro modelo de transcrição com timestamps
- Um modelo multimodal para analisar imagens e quadros de vídeo
- Opcional: provedor de geração de imagem
- Opcional: provedor de geração de vídeo

---

## Instalação no Ubuntu, Debian ou WSL

```bash
sudo apt update
sudo apt install -y ffmpeg python3 python3-venv python3-pip
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Instalação no Windows

Com Winget:

```powershell
winget install Gyan.FFmpeg
winget install Python.Python.3.12
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Depois valide:

```bash
ffmpeg -version
ffprobe -version
python --version
```

---

## Criar um projeto

```bash
python scripts/create_project.py meu-clipe
```

Estrutura esperada de entrada:

```text
meu-clipe/input/audio/musica.mp3
meu-clipe/input/images/*.jpg
meu-clipe/input/videos/*.mp4
meu-clipe/input/lyrics.txt
```

---

## Fluxo básico

### 1) Criar o inventário do projeto

```bash
python scripts/media_inventory.py meu-clipe
```

### 2) Transcrever a música e gerar a legenda

```bash
python scripts/transcribe.py meu-clipe/input/audio/musica.mp3 --output meu-clipe/work
```

### 3) Rodar o agente multimodal

O agente deve preencher ou gerar:

- `work/media_catalog.json`
- `work/character_bible.json`
- `work/semantic_map.json`
- `work/generation_requests.json`
- `work/storyboard.md`
- `work/edit_plan.json`

### 4) Validar o plano

```bash
python scripts/validate_plan.py meu-clipe/work/edit_plan.json
```

### 5) Renderizar a prévia e o clipe

```bash
python scripts/render_clip.py meu-clipe
```

---

## Como o agente deve pensar

A ordem correta é esta:

1. Ler a música.
2. Entender a letra.
3. Criar legendas com timecodes.
4. Ver o que há em cada imagem.
5. Ver o que acontece em cada vídeo.
6. Descobrir quem são os personagens principais.
7. Criar uma ficha de continuidade.
8. Quebrar a letra em intenções visuais.
9. Escolher a melhor mídia para cada trecho.
10. Gerar mídia para o que estiver faltando.
11. Revisar a mídia gerada.
12. Montar a timeline.
13. Validar.
14. Renderizar o final.

Se a letra disser algo concreto, o agente deve verificar isso visualmente.

Exemplo:

- “cinco vidas” = precisa de cinco pessoas;
- “casamos” = priorizar casamento ou união formal;
- “lado a lado” = priorizar cenas de parceria, caminhada, abraço, convivência;
- “dois anos depois” = pode pedir transição temporal.

---

## Saídas esperadas

No mínimo:

- `output/preview.mp4`
- `output/final_16x9.mp4`
- `output/final_16x9_burned_subs.mp4`
- `output/final_9x16.mp4` se solicitado
- `output/quality_report.md`

---

## Sobre o modelo de visão

A análise visual **não pode** depender apenas de nomes de arquivo.

O agente precisa usar um modelo com visão para:

- descrever imagens;
- contar pessoas;
- identificar ações;
- detectar contexto emocional;
- revisar quadros-chave dos vídeos;
- conferir a mídia gerada antes de aprová-la.

Você pode integrar, por exemplo:

- Qwen-VL
- LLaVA
- Florence
- GPT multimodal
- Gemini multimodal
- outro modelo de visão compatível

---

## Sobre geração de mídia

A skill não força um gerador específico.

Ela só cria o arquivo `generation_requests.json` com instruções claras. Depois você pode conectar isso a:

- n8n;
- automação própria;
- ComfyUI;
- APIs de imagem;
- APIs de vídeo.

O importante é que a mídia gerada volte para:

```text
generated/images/
generated/videos/
```

e seja reanalisada antes de ir para a timeline.

---

## Integração recomendada com n8n

Pipeline sugerido:

```text
Trigger do projeto
    ↓
Leitura da pasta
    ↓
Transcrição
    ↓
Análise visual
    ↓
Criação do character_bible
    ↓
Mapa semântico
    ↓
Geração de lacunas
    ↓
Validação da geração
    ↓
Montagem com FFmpeg
    ↓
Prévia
    ↓
Validação final
    ↓
Render final
```

---

## Observação prática importante

Se você quiser transformar isso no seu agente principal de criação de clipes, o melhor caminho é:

1. usar essa skill como cérebro do processo;
2. deixar o n8n controlar as etapas;
3. usar FFmpeg para a montagem;
4. usar um modelo de visão para entender as cenas;
5. usar um gerador de imagem/vídeo só para preencher lacunas.

Assim você fica com um agente de clipes de verdade, e não apenas um script que cola mídia na timeline.
