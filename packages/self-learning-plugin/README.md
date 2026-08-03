# Self-learning plugin

Implementa um ciclo conservador de autoaprendizagem inspirado no Hermes:

1. registra uma trajetória resumida ao final da sessão;
2. exige evidência explícita antes de considerar sucesso;
3. transforma procedimentos reutilizáveis em skills candidatas;
4. mantém metadados de versão, confiança, usos, sucessos e falhas;
5. promove skills para `experimental` e `trusted` conforme reutilização bem-sucedida;
6. rebaixa skills para `deprecated` após falhas recorrentes;
7. injeta apenas um catálogo compacto de skills no contexto.

## Armazenamento

- Trajetórias: `~/.config/opencode/learning/sessions/`
- Skills: `~/.config/opencode/skills/<nome>/SKILL.md`
- Metadados: `~/.config/opencode/skills/<nome>/metadata.json`
- Feedback: `~/.config/opencode/skills/<nome>/feedback.log`

## Regra de segurança

Uma skill só é criada quando a trajetória informa `outcome: success`, possui evidência e contém ao menos dois passos. Blocos com possíveis credenciais são rejeitados.

## Estados

- `candidate`: primeira execução validada;
- `experimental`: três sucessos sem falhas;
- `trusted`: sete sucessos e taxa mínima de 85%;
- `deprecated`: falhas recorrentes;
- `rejected`: reservado para rejeição manual ou futura revisão automatizada.
