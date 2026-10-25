# X Bot Arena — demo jogável

Demo em terceira pessoa feita com Three.js (r169). Você controla o **X Bot do Mixamo** numa arena flutuante e coleta orbes.

```bash
python3 -m http.server 8080   # na raiz do repositório
# abrir http://localhost:8080/game/
```

## Controles

| Ação | Teclado | Celular |
|---|---|---|
| Andar | W A S D / setas | joystick (esquerda) |
| Correr | Shift | botão Correr ou joystick no máximo |
| Pular | Espaço | Pular |
| Agachar / andar furtivo | C (liga/desliga) | Agachar |
| Gesto "sim" | 1 ou E | Sim |
| Gesto "não" | 2 ou Q | Não |
| Dançar (samba) | 3 ou F | Dança |
| Girar câmera | arrastar o mouse; roda = zoom | arrastar na tela |

## Animação

- **idle, walk e run** são misturados pelo peso conforme a velocidade. O ritmo do ciclo acompanha a velocidade real, para os pés não escorregarem.
- **Agachar e os gestos** (`sneak_pose`, `agree`, `headShake`) entram como camadas aditivas por cima da locomoção.
- **A samba** vem do rig da Michelle. Ela é re-mapeada para o X Bot em tempo de carregamento: os dois rigs foram exportados com eixos de osso diferentes, então cada quadro é convertido como delta de rotação em espaço de mundo a partir da pose de repouso (ver `retarget()` em `src/game.js`).
- **O pulo é procedural:** agachamento de antecipação, arco balístico e absorção na queda. Esses arquivos do Mixamo não trazem clipe de pulo.

## Assets e licenças

- `Xbot.glb` (personagem X Bot com idle/walk/run/agree/headShake/sneak_pose/sad_pose) e `Michelle.glb` (SambaDance) são personagens e animações do **Mixamo (Adobe)**. Eles foram obtidos dos exemplos oficiais do three.js (`examples/models/gltf/`). O Mixamo permite usar os personagens e animações sem royalties em projetos, mas não permite redistribuí-los como assets avulsos.
- three.js: licença MIT (`vendor/three/LICENSE`).
- Para usar outras animações do Mixamo, baixe em mixamo.com com o X Bot ("FBX Binary", "Without Skin"), carregue com `FBXLoader` e adicione como `clipAction`. Os nomes de osso `mixamorig*` já batem com os do X Bot.
