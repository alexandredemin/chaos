//---------------------------- Shaders ----------------------------
const GrayScalePipeline = new Phaser.Class({
    Extends: Phaser.Renderer.WebGL.Pipelines.SinglePipeline,
    initialize:
        function GrayScalePipeline(game) {
            Phaser.Renderer.WebGL.Pipelines.SinglePipeline.call(this, {
                game: game,
                renderer: game.renderer,
                fragShader: `
                precision mediump float;
                uniform sampler2D uMainSampler;
                uniform float darkness;
                uniform float gamma;
                varying vec2 outTexCoord;
                void main(void) {
                vec4 color = texture2D(uMainSampler, outTexCoord);
                float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                gray = pow(gray, gamma) * darkness;
                //gl_FragColor = vec4(vec3(gray), 1.0);
                gl_FragColor = vec4(vec3(gray), color.a);
                }`
            });
        }
});

/*
const fragShader = `
        precision mediump float;
        uniform sampler2D uMainSampler;
        varying vec2 outTexCoord;
        void main(void)
        {
          vec4 texture = texture2D(uMainSampler, outTexCoord);
          if (texture.a != 0.0)
          {
            //texture.rgb = vec3(texture.r*texture.r * 1.5, texture.g*texture.g * 1.5, texture.b*texture.b * 1.5);
            //texture.rgb = vec3(texture.r * 0.5, texture.g * 0.5, texture.b * 0.5);
            float gamma = 1.0;
            float contrast = 1.5;
            float brightness = 0.5;
            texture.r = (pow(texture.r,gamma) - 0.5)*contrast + brightness + 0.5;
            texture.g = (pow(texture.g,gamma) - 0.5)*contrast + brightness + 0.5;
            texture.b = (pow(texture.b,gamma) - 0.5)*contrast + brightness + 0.5;
          }
          gl_FragColor = texture;
        }
`;*/

const fragShader = `
                precision lowp float;
                varying vec2 outTexCoord;
                varying vec4 outTint;
                uniform sampler2D uMainSampler;
                uniform float alpha;
                uniform float time;
                void main() {
                    vec4 sum = vec4(0);
                    vec2 texcoord = outTexCoord;
                    for(int xx = -4; xx <= 4; xx++) {
                        for(int yy = -4; yy <= 4; yy++) {
                            float dist = sqrt(float(xx*xx) + float(yy*yy));
                            float factor = 0.0;
                            if (dist == 0.0) {
                                factor = 2.0;
                            } else {
                                factor = 2.0/abs(float(dist));
                            }
                            sum += texture2D(uMainSampler, texcoord + vec2(xx, yy) * 0.002) * (abs(sin(time))+0.06);
                        }
                    }
                    gl_FragColor = sum * 0.025 + texture2D(uMainSampler, texcoord)*alpha;
                }
`;

class CustomPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline
{
    constructor (game)
    {
        super({
            game,
            fragShader,
            //uniforms: [
            //    'uMainSampler',
            //    'gray'
            //]
        });

        this._gray = 1;
    }

    onPreRender ()
    {
        this.set1f('gray', this._gray);
    }

    get alpha ()
    {
        return this._gray;
    }

    set alpha (value)
    {
        this._gray = value;
    }
}

var CustomPipeline2 = new Phaser.Class({
    Extends: Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline,
    initialize:
        function CustomPipeline2 (game)
        {
            Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline.call(this, {
                game: game,
                renderer: game.renderer,
                fragShader: [
                    'precision lowp float;',
                    'varying vec2 outTexCoord;',
                    'varying vec4 outTint;',
                    'uniform sampler2D uMainSampler;',
                    'uniform float alpha;',
                    'uniform float time;',
                    'void main() {',
                    'vec4 sum = vec4(0);',
                    'vec2 texcoord = outTexCoord;',
                    'for(int xx = -4; xx <= 4; xx++) {',
                    'for(int yy = -4; yy <= 4; yy++) {',
                    'float dist = sqrt(float(xx*xx) + float(yy*yy));',
                    'float factor = 0.0;',
                    'if (dist == 0.0) {',
                    'factor = 2.0;',
                    '} else {',
                    'factor = 2.0/abs(float(dist));',
                    '}',
                    'sum += texture2D(uMainSampler, texcoord + vec2(xx, yy) * 0.002) * (abs(sin(time))+0.06);',
                    '}',
                    '}',
                    'gl_FragColor = sum * 0.025 + texture2D(uMainSampler, texcoord)*alpha;',
                    '}'
                ].join('\n')
            });
        }
});