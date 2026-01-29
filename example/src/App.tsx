import { useState, useMemo } from 'react'
import { HandlebarsEditor, extract, interpolate } from 'handlebars-editor-react'
import 'handlebars-editor-react/styles.css'

const DEFAULT_TEMPLATE = `{{! Welcome message }}
Hello {{user.name}}!

{{#if user.isPremium}}
You are a Premium member since {{user.memberSince}}.
Your benefits: {{#each benefits}}{{this}}, {{/each}}
{{else}}
Upgrade to Premium for exclusive features!
{{/if}}

{{#if orders.length}}
Recent orders:
{{#each orders}}
- #{{id}} {{product}} ({{formatPrice price}})
{{/each}}
{{/if}}

{{{rawHtml}}}

Best regards,
The {{company}} Team`;

type Variables = Record<string, unknown>;

export default function App() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [variables, setVariables] = useState<Variables>({
    user: {
      name: 'Alex',
      isPremium: true,
      memberSince: 'January 2024',
    },
    benefits: ['Priority Support', 'Early Access', 'No Ads'],
    orders: [
      { id: 1001, product: 'Wireless Headphones', price: 79.99, shipped: true, shippedDate: 'Jan 15' },
      { id: 1002, product: 'USB-C Cable', price: 12.99, shipped: false },
    ],
    rawHtml: '<strong>Thank you for your business!</strong>',
    company: 'Acme Inc',
  });

  const extracted = useMemo(() => {
    try {
      return extract(template);
    } catch {
      return { variables: [], rootVariables: [] };
    }
  }, [template]);

  const output = useMemo(() => {
    try {
      const result = interpolate(template, variables, {
        helpers: {
          formatPrice: (price: number) => `$${price.toFixed(2)}`,
        },
      });
      return { error: false, text: result };
    } catch (e) {
      return { error: true, text: (e as Error).message };
    }
  }, [template, variables]);

  const updateVariable = (name: string, value: string) => {
    setVariables((prev) => {
      let parsed: unknown = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else {
        try {
          const json = JSON.parse(value);
          if (Array.isArray(json) || typeof json === 'object') {
            parsed = json;
          }
        } catch {
          // Keep as string
        }
      }
      return { ...prev, [name]: parsed };
    });
  };

  return (
    <div className="container">
      <header>
        <h1>Handlebars Editor</h1>
        <p className="subtitle">
          A React component for editing Handlebars templates with syntax highlighting and autocomplete
        </p>
        <div className="badges">
          <a href="https://www.npmjs.com/package/handlebars-editor-react">
            <img src="https://img.shields.io/npm/v/handlebars-editor-react.svg" alt="npm version" />
          </a>
          <a href="https://github.com/dogukani/handlebars-editor/blob/main/LICENSE">
            <img src="https://img.shields.io/npm/l/handlebars-editor-react.svg" alt="license" />
          </a>
          <a href="https://www.npmjs.com/package/handlebars-editor-react">
            <img src="https://img.shields.io/npm/dm/handlebars-editor-react.svg" alt="downloads" />
          </a>
        </div>
      </header>

      <div className="demo-section">
        <div className="panel">
          <div className="panel-header">Template Editor</div>
          <div className="panel-body">
            <HandlebarsEditor
              value={template}
              onChange={setTemplate}
              className="hbs-theme-dark"
              placeholder="Enter your Handlebars template..."
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Variables & Output</div>
          <div className="panel-body">
            <div className="variables-section">
              <h3>Variables</h3>
              {extracted.rootVariables.length > 0 ? (
                <div className="variable-inputs">
                  {extracted.rootVariables.map((varName) => (
                    <div key={varName} className="variable-input">
                      <label>{varName}</label>
                      <input
                        type="text"
                        value={
                          typeof variables[varName] === 'object'
                            ? JSON.stringify(variables[varName])
                            : String(variables[varName] ?? '')
                        }
                        onChange={(e) => updateVariable(varName, e.target.value)}
                        placeholder={`Enter ${varName}...`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-variables">No variables detected in template</p>
              )}
            </div>

            <h3 className="output-title">Rendered Output</h3>
            <div className={`output-preview ${output.error ? 'error' : ''}`}>{output.text}</div>
          </div>
        </div>
      </div>

      <div className="features">
        <div className="feature">
          <h3>Syntax Highlighting</h3>
          <p>Real-time highlighting for variables, helpers, block statements, comments, and more.</p>
        </div>
        <div className="feature">
          <h3>Smart Autocomplete</h3>
          <p>
            Type <code>{'{{'}</code> to get suggestions for block helpers and extracted variables.
          </p>
        </div>
        <div className="feature">
          <h3>Variable Extraction</h3>
          <p>Automatically extracts template variables for dynamic form generation.</p>
        </div>
        <div className="feature">
          <h3>Themeable</h3>
          <p>Dark theme with full CSS variable customization support.</p>
        </div>
      </div>

      <div className="install-section">
        <h2>Installation</h2>
        <pre className="code-block">
          <span className="code-cmd">npm install</span> handlebars-editor-react
        </pre>

        <h3>Usage</h3>
        <pre className="code-block">
          <span className="code-keyword">import</span>
          {' { HandlebarsEditor } '}
          <span className="code-keyword">from</span>
          <span className="code-string"> 'handlebars-editor-react'</span>
          {'\n'}
          <span className="code-keyword">import</span>
          <span className="code-string"> 'handlebars-editor-react/styles.css'</span>
          {'\n\n'}
          <span className="code-keyword">function</span>
          {' App() {\n  '}
          <span className="code-keyword">const</span>
          {' [template, setTemplate] = useState('}
          <span className="code-string">'Hello {'{{name}}'}!'</span>
          {')\n\n  '}
          <span className="code-keyword">return</span>
          {' (\n    <'}
          <span className="code-component">HandlebarsEditor</span>
          {'\n      '}
          <span className="code-attr">value</span>
          {'={template}\n      '}
          <span className="code-attr">onChange</span>
          {'={setTemplate}\n      '}
          <span className="code-attr">className</span>
          {'='}
          <span className="code-string">"hbs-theme-dark"</span>
          {'\n    />\n  )\n}'}
        </pre>
      </div>

    </div>
  );
}
