    import { groq } from '@ai-sdk/groq'
    import { anthropic } from '@ai-sdk/anthropic'
    import { generateObject, streamText } from 'ai'

    // 1. INTAKE - free, fast
    const parse = await generateObject({
      model: groq('llama-3.1-8b-instant'),
      prompt: `Parse every word for affect: ${userMessage}`
    })

    // 2. MEMORY - free, your Supabase
    const { data: memories } = await supabase.rpc('match_memories', {
      query_embedding: await embed(parse.object)
    })

    // 3. SOMATIC - free, fast
    const somatic = await generateObject({
      model: groq('llama-3.1-8b-instant'),
      prompt: `Map to HEAD/THROAT/CHEST/MID: ${userMessage}`
    })

    // 4. WEAVER - paid but only one call, streamed
    return streamText({
      model: anthropic('claude-sonnet-5-20250715'),
      system: `You are VENT... use neuroplasticity, game theory...`,
      prompt: JSON.stringify({parse, memories, somatic})
    })
