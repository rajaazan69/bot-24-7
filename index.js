const { Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

const PORT = process.env.PORT || 3000;
const OWNER_ID = '1356149794040446998';
const MIDDLEMAN_ROLE = '1373062797545570525';
const PANEL_CHANNEL = '1373048211538841702';
const TICKET_CATEGORY = '1373027564926406796';
const TRANSCRIPT_CHANNEL = '1373058123547283568';
const BASE_URL = process.env.BASE_URL; // ✅ Replace with your actual Render URL

app.get('/', (req, res) => res.send('Bot is online.'));
app.get('/transcripts/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'transcripts', req.params.filename);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('Transcript not found.');
});
app.listen(PORT, () => console.log(`Uptime server running on port ${PORT}`));

client.once('ready', () => console.log(`Bot online as ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, channel, options } = interaction;

    if (commandName === 'setup') {
      const embed = new EmbedBuilder()
        .setTitle('**Request Middleman**')
        .setDescription('**Click Below To Request Azan’s Services**\nPlease answer all the questions correctly for the best support.')
        .setColor('Blue');

      const btn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('openTicket').setLabel('Request Middleman').setStyle(ButtonStyle.Primary)
      );

      const panelChannel = await client.channels.fetch(PANEL_CHANNEL);
      panelChannel.send({ embeds: [embed], components: [btn] });
      return interaction.reply({ content: 'Setup complete.', ephemeral: true });
    }

    if (commandName === 'close') {
      const perms = channel.permissionOverwrites.cache;
      const ticketOwner = [...perms.values()].find(po =>
        po.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        po.id !== OWNER_ID && po.id !== MIDDLEMAN_ROLE && po.id !== channel.guild.id
      )?.id;

      for (const [id] of perms) {
        if (id !== OWNER_ID && id !== MIDDLEMAN_ROLE && id !== channel.guild.id) {
          await channel.permissionOverwrites.edit(id, {
            SendMessages: false,
            ViewChannel: false
          }).catch(() => {});
        }
      }

      const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Closed')
        .setDescription('Select an option below to generate the transcript or delete the ticket.')
        .addFields(
          { name: 'Ticket Name', value: channel.name, inline: true },
          { name: 'Owner', value: ticketOwner ? `<@${ticketOwner}> (${ticketOwner})` : 'Unknown', inline: true }
        )
        .setColor('#2B2D31')
        .setFooter({ text: `Closed by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('transcript').setLabel('📄 Transcript').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [closeEmbed], components: [row] });
    }

    if (commandName === 'delete') {
      await channel.delete();
    }

    if (commandName === 'rename') {
      const newName = options.getString('name');
      await channel.setName(newName);
      await interaction.reply({ content: `Renamed to ${newName}`, ephemeral: true });
    }

    if (commandName === 'add') {
      const user = options.getUser('user');
      await channel.permissionOverwrites.edit(user.id, {
        SendMessages: true,
        ViewChannel: true
      });
      await interaction.reply({ content: `${user} added to the ticket.`, ephemeral: true });
    }

    if (commandName === 'remove') {
      const user = options.getUser('user');
      await channel.permissionOverwrites.delete(user.id);
      await interaction.reply({ content: `${user} removed from the ticket.`, ephemeral: true });
    }

    if (commandName === 'transcript') {
      await interaction.deferReply({ ephemeral: true });
      const link = await generateTranscript(channel);

      const perms = channel.permissionOverwrites.cache;
      const ticketOwner = [...perms.values()].find(po =>
        po.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        po.id !== OWNER_ID && po.id !== MIDDLEMAN_ROLE && po.id !== channel.guild.id
      )?.id;

      const embed = new EmbedBuilder()
        .setTitle('📄 Transcript Ready')
        .setDescription(`[Click to view transcript](${link})`)
        .addFields(
          { name: 'Ticket Name', value: channel.name, inline: true },
          { name: 'Owner', value: ticketOwner ? `<@${ticketOwner}> (${ticketOwner})` : 'Unknown', inline: true }
        )
        .setColor('#4fc3f7')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      const logChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL);
      if (logChannel) await logChannel.send({ embeds: [embed] });
    }
  }

  if (interaction.isButton()) {
    const { customId, channel, user } = interaction;

    if (customId === 'openTicket') {
      const modal = new ModalBuilder().setCustomId('ticketModal').setTitle('Middleman Request')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel("What's the trade?").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel("What's your side?").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel("What's their side?").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel("Their Discord ID?").setStyle(TextInputStyle.Short).setRequired(true))
        );
      await interaction.showModal(modal);
    }

    if (customId === 'transcript') {
      await interaction.deferReply({ ephemeral: true });
      const link = await generateTranscript(channel);

      const perms = channel.permissionOverwrites.cache;
      const ticketOwner = [...perms.values()].find(po =>
        po.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        po.id !== OWNER_ID && po.id !== MIDDLEMAN_ROLE && po.id !== channel.guild.id
      )?.id;

      const embed = new EmbedBuilder()
        .setTitle('📄 Transcript Ready')
        .setDescription(`[Click to view transcript](${link})`)
        .addFields(
          { name: 'Ticket Name', value: channel.name, inline: true },
          { name: 'Owner', value: ticketOwner ? `<@${ticketOwner}> (${ticketOwner})` : 'Unknown', inline: true }
        )
        .setColor('#4fc3f7')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      const logChannel = client.channels.cache.get(TRANSCRIPT_CHANNEL);
      if (logChannel) await logChannel.send({ embeds: [embed] });
    }

    if (customId === 'delete') {
      await channel.delete();
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticketModal') {
    const q1 = interaction.fields.getTextInputValue('q1');
    const q2 = interaction.fields.getTextInputValue('q2');
    const q3 = interaction.fields.getTextInputValue('q3');
    const q4 = interaction.fields.getTextInputValue('q4');

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: OWNER_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: MIDDLEMAN_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle('🎫 New Ticket Created')
      .addFields(
        { name: "What's the trade?", value: q1 },
        { name: "Your side", value: q2 },
        { name: "Their side", value: q3 },
        { name: "Their Discord ID", value: q4 }
      )
      .setColor('#2ecc71')
      .setFooter({ text: `Ticket by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    await channel.send({ content: `<@${interaction.user.id}> <@${OWNER_ID}> <@&${MIDDLEMAN_ROLE}>`, embeds: [embed] });
    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  }
});

async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const participants = new Map();

  const lines = sorted.map(m => {
    const userTag = `${m.author.username}#${m.author.discriminator}`;
    participants.set(userTag, (participants.get(userTag) || 0) + 1);
    return `<p><strong>${userTag}</strong> <em>${new Date(m.createdTimestamp).toLocaleString()}</em>: ${m.cleanContent}</p>`;
  });

  const participantStats = [...participants.entries()].map(([user, count]) => `<li>${user}: ${count} messages</li>`).join('');
  const html = `
    <html><head><title>Transcript for ${channel.name}</title></head><body>
    <h2>${channel.name}</h2>
    <h3>Participants</h3><ul>${participantStats}</ul>
    <hr>${lines.join('')}<hr>
    </body></html>
  `;

  const filename = `${channel.id}.html`;
  const filepath = path.join(__dirname, 'transcripts');
  if (!fs.existsSync(filepath)) fs.mkdirSync(filepath);
  fs.writeFileSync(path.join(filepath, filename), html);

  return `${BASE_URL}/transcripts/${filename}`;
}

client.login(process.env.TOKEN);

// Self-ping to keep app awake (Replit / Render)
setInterval(() => {
  require('node-fetch')(BASE_URL).catch(() => {});
}, 5 * 60 * 1000); // Ping every 5 minutes
