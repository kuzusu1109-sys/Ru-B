const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DynamicLoader, Version } = require('bcdice');

const PREFIX = '!';
const DEFAULT_SYSTEM = 'SwordWorld2.5';

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

  if (content.startsWith(PREFIX)) {
    const args = content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();

    if (cmd === 'help') {
      const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;
      const embed = new EmbedBuilder()
        .setTitle('🎲 TRPG Dice Bot')
        .setColor(0x5865f2)
        .addFields(
          { name: '骰子', value: '`2d6+3` `3d6>=10` `K20@13` `K30@10+5`' },
          { name: '系統', value: '`!set <ID>` `!system` `!search <word>` `!syshelp` `!list`' },
          { name: '其他', value: '`!help` `!version`' },
          { name: '目前系統', value: '`' + sys + '`' }
        )
        .setFooter({ text: `BCDice ${Version} | ${loader.listAvailableGameSystems().length} systems` });

      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'set') {
      if (!args.length) {
        await message.channel.send('❌ Usage: `!set SwordWorld2.5`');
        return;
      }

      const input = args[0];

      try {
        const GS = await getGameSystem(input);
        channelSystems.set(message.channelId, input);
        await message.channel.send(`✅ Set to **${GS.NAME}** (\`${input}\`)`);
        return;
      } catch {}

      const match = loader.listAvailableGameSystems().find(
        s => s.id.toLowerCase() === input.toLowerCase()
      );

      if (match) {
        try {
          const GS = await getGameSystem(match.id);
          channelSystems.set(message.channelId, match.id);
          await message.channel.send(`✅ Set to **${GS.NAME}** (\`${match.id}\`)`);
          return;
        } catch {}
      }

      await message.channel.send(`❌ \`${input}\` not found. Try \`!search\``);
      return;
    }

    if (cmd === 'system') {
      const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;
      await message.channel.send(`🎲 Current: **${sys}**`);
      return;
    }

    if (cmd === 'search') {
      if (!args.length) {
        await message.channel.send('❌ Usage: `!search sword`');
        return;
      }

      const kw = args.join(' ').toLowerCase();
      const results = loader.listAvailableGameSystems().filter(
        s => s.id.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw)
      );

      if (!results.length) {
        await message.channel.send(`🔍 No results for "${kw}".`);
        return;
      }

      const text = results.slice(0, 20).map(
        s => `• **${s.name}** → \`${s.id}\``
      ).join('\n');

      const more = results.length > 20 ? `\n...+${results.length - 20} more` : '';

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🔍 ${kw}`)
            .setColor(0x57f287)
            .setDescription(text + more)
        ]
      });
      return;
    }

    if (cmd === 'list') {
      const all = loader.listAvailableGameSystems();
      const text = all.slice(0, 40).map(s => `\`${s.id}\``).join(', ');
      const more = all.length > 40 ? `\n...+${all.length - 40} more (use \`!search\`)` : '';

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📋 All Systems (${all.length})`)
            .setColor(0x5865f2)
            .setDescription(text + more)
        ]
      });
      return;
    }

    if (cmd === 'syshelp') {
      const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;

      try {
        const GS = await getGameSystem(sys);
        const help = GS.HELP_MESSAGE || 'No help available.';
        for (const chunk of help.match(/[\s\S]{1,1900}/g) || ['N/A']) {
          await message.channel.send(`📖 **${GS.NAME}**:\n\`\`\`\n${chunk}\n\`\`\``);
        }
      } catch {
        await message.channel.send('❌ Could not load help.');
      }
      return;
    }

    if (cmd === 'version') {
      await message.channel.send(
        `🎲 BCDice **${Version}** | Systems: **${loader.listAvailableGameSystems().length}**`
      );
      return;
    }
  }

  if (/^(k\d+(@\d+)?([+-]\d+)?|\d+d\d+|cc|cb|cbr|res|fal|sr|ar|ht|et|ft|st|at|pot|mp|dbt|crt)/i.test(content)) {
    const sys = channelSystems.get(message.channelId) || DEFAULT_SYSTEM;
    const result = await rollDice(sys, content);

    if (result && result.text) {
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setAuthor({
          name: message.member?.displayName || message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
        .setDescription(`🎲 ${result.text}`)
        .setFooter({ text: sys })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    }
  }
});

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

  client.once('ready', () => {
    console.log('  Bot ONLINE: ' + client.user.tag);
    console.log('  Servers: ' + client.guilds.cache.size);
    client.user.setActivity('!help | SW2.5');
  });

  client.on('error', (e) => console.error('Discord error:', e));

  await client.login(token.trim());
}

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
main();
