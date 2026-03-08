const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DynamicLoader, Version } = require('bcdice');

// ============================
// Settings
// ============================
const PREFIX = '!';
const DEFAULT_SYSTEM = 'SwordWorld2.5';

// ============================
// BCDice
// ============================
const loader = new DynamicLoader();
const channelSystems = new Map();
const loadedSystems = new Map();

async function getGameSystem(systemId) {
  if (loadedSystems.has(systemId)) return loadedSystems.get(systemId);
  const GS = await loader.dynamicLoad(systemId);
  loadedSystems.set(systemId, GS);
  return GS;
}

async function rollDice(systemId, command) {
  try {
    const GS = await getGameSystem(systemId);
    return GS.eval(command);
  } catch (error) {
    console.error('Roll error:', error.message);
    return null;
  }
}

// ============================
// Discord
// ============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // --- Commands ---
  if (content.startsWith(PREFIX)) {
    const args = content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();

    if (cmd === 'help') {
      const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;
      const embed = new EmbedBuilder()
        .setTitle('🎲 TRPG Dice Bot')
        .setColor(0x5865f2)
        .addFields(
          { name: '📌 Dice', value: '`2d6+3`  `3d6>=10`  `K20@13`  `x3 2D6`  `x3 K20@13`' },
          { name: '⚙️ System', value: '`!set <ID>` - Set game system\n`!system` - Current system\n`!search <word>` - Search\n`!syshelp` - System commands\n`!list` - All systems' },
          { name: '📋 Other', value: '`!help` `!version`' },
          { name: '💡 Current', value: '`' + sys + '`' }
        )
        .setFooter({ text: 'BCDice ' + Version + ' | ' + loader.listAvailableGameSystems().length + ' systems' });

      return message.channel.send({ embeds: [embed] });
    }

    if (cmd === 'set') {
      if (!args.length) return message.channel.send('❌ Usage: `!set SwordWorld2.5`');

      const input = args[0];

      // Exact match
      try {
        const GS = await getGameSystem(input);
        channelSystems.set(message.channelId, input);
        return message.channel.send('✅ Set to **' + GS.NAME + '** (`' + input + '`)');
      } catch {}

      // Fuzzy match
      const match = loader.listAvailableGameSystems().find(
        s => s.id.toLowerCase() === input.toLowerCase()
      );

      if (match) {
        try {
          const GS = await getGameSystem(match.id);
          channelSystems.set(message.channelId, match.id);
          return message.channel.send('✅ Set to **' + GS.NAME + '** (`' + match.id + '`)');
        } catch {}
      }

      return message.channel.send('❌ `' + input + '` not found. Try `!search`');
    }

    if (cmd === 'system') {
      const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;
      return message.channel.send('🎲 Current: **' + sys + '**');
    }

    if (cmd === 'search') {
      if (!args.length) return message.channel.send('❌ Usage: `!search sword`');

      const kw = args.join(' ').toLowerCase();
      const results = loader.listAvailableGameSystems().filter(
        s => s.id.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw)
      );

      if (!results.length) return message.channel.send('🔍 No results for "' + kw + '".');

      const text = results
        .slice(0, 20)
        .map(s => '• **' + s.name + '** → `' + s.id + '`')
        .join('\n');

      const more = results.length > 20 ? '\n...+' + (results.length - 20) + ' more' : '';

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🔍 ' + kw)
            .setColor(0x57f287)
            .setDescription(text + more)
        ]
      });
    }

    if (cmd === 'list') {
      const all = loader.listAvailableGameSystems();
      const text = all.slice(0, 40).map(s => '`' + s.id + '`').join(', ');
      const more = all.length > 40 ? '\n...+' + (all.length - 40) + ' more (use `!search`)' : '';

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📋 All Systems (' + all.length + ')')
            .setColor(0x5865f2)
            .setDescription(text + more)
        ]
      });
    }

    if (cmd === 'syshelp') {
      const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;

      try {
        const GS = await getGameSystem(sys);
        const help = GS.HELP_MESSAGE || 'No help available.';
        for (const chunk of help.match(/[\s\S]{1,1900}/g) || ['N/A']) {
          await message.channel.send('📖 **' + GS.NAME + '**:\n```\n' + chunk + '\n```');
        }
      } catch {
        return message.channel.send('❌ Could not load help.');
      }
      return;
    }

    if (cmd === 'version') {
      return message.channel.send(
        '🎲 BCDice **' + Version + '** | Systems: **' + loader.listAvailableGameSystems().length + '**'
      );
    }
  }

  // --- Auto dice detection ---
  // 支援:
  // 2d6
  // 1d100
  // K20@13
  // x3 2D6
  // rep3 2D6
  // repeat3 K20@13
  if (/^(x\d+\s+.+|rep\d+\s+.+|repeat\d+\s+.+|k\d+(@\d+)?([+-]\d+)?|\d+d\d+|abt|tt|cc|cb|cbr|res|fal|sr|ar|ht|et|ft|st|at|pot|mp|dbt|gr|crt)/i.test(content)) {
    const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;
    const result = await rollDice(sys, content);

    if (result && result.text) {
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setAuthor({
          name: message.member?.displayName || message.author.displayName || message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
        .setDescription('🎲 ' + result.text)
        .setFooter({ text: sys })
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }
  }
});

// ============================
// Startup
// ============================
async function main() {
  console.log('========================================');
  console.log('  TRPG Dice Discord Bot');
  console.log('  Node.js ' + process.version);
  console.log('  BCDice ' + Version);
  console.log('  Systems: ' + loader.listAvailableGameSystems().length);
  console.log('========================================');

  const test = await rollDice(DEFAULT_SYSTEM, '2d6');
  if (test && test.text) {
    console.log('  Test 2d6: ' + test.text);
  } else {
    console.log('  [WARN] Test roll failed');
  }

  const token = process.env.DISCORD_TOKEN;
  console.log('ENV CHECK:', !!token);

  if (!token) {
    console.error('[ERROR] DISCORD_TOKEN environment variable not set.');
    process.exit(1);
  }

  client.once('clientReady', () => {
    console.log('  Bot ONLINE: ' + client.user.tag);
    console.log('  Servers: ' + client.guilds.cache.size);
    console.log('  Running... Ctrl+C to stop.');
    console.log('');
    client.user.setActivity('哼，叫救護車來都沒用！', { type: 0 });
  });

  client.on('error', (e) => console.error('Discord error:', e));

  try {
    await client.login(token.trim());
  } catch (error) {
    console.error('[ERROR] Login failed: ' + error.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
main();
