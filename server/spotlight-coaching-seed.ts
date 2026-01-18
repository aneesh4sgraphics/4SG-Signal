import { db } from "./db";
import { spotlightMicroCards, spotlightCoachTips } from "@shared/schema";

export async function seedSpotlightCoachingContent(): Promise<void> {
  try {
    console.log('[Spotlight Coaching] Seeding/updating micro-coaching cards...');
    
    const microCards = [
      // Product Quizzes
      {
        cardType: 'product_quiz',
        title: 'Vehicle Wrap Materials',
        content: 'Test your product knowledge',
        question: 'What is the best material for outdoor vehicle wraps that need to last 5+ years?',
        options: ['Graffiti Polyester Paper', 'Graffiti SOFT Poly', 'Cast Vinyl', 'Graffiti Blended Poly'],
        correctAnswer: 2,
        explanation: 'Cast vinyl is the premium choice for vehicle wraps due to its conformability and 5-7 year outdoor durability.',
        difficulty: 'medium',
        tags: ['vehicle_wraps', 'vinyl', 'outdoor'],
      },
      {
        cardType: 'product_quiz',
        title: 'Synthetic Label Materials',
        content: 'Know your synthetics',
        question: 'Which material is best for waterproof labels on bottles?',
        options: ['Paper Labels', 'Graffiti SOFT Poly', 'Cardstock', 'Kraft Paper'],
        correctAnswer: 1,
        explanation: 'Graffiti SOFT Poly is synthetic and waterproof, perfect for beverage bottles and cosmetics.',
        difficulty: 'easy',
        tags: ['labels', 'waterproof', 'beverages'],
      },
      {
        cardType: 'product_quiz',
        title: 'Printer Compatibility',
        content: 'Match products to printers',
        question: 'Which of our products is specifically designed for HP Indigo presses?',
        options: ['DTF Film', 'Graffiti Polyester Paper', 'Screen Printing Positives', 'Offset Plates'],
        correctAnswer: 1,
        explanation: 'Graffiti Polyester Paper is specially coated for HP Indigo and digital dry toner presses.',
        difficulty: 'medium',
        tags: ['hp_indigo', 'digital_print'],
      },
      {
        cardType: 'product_quiz',
        title: 'Wide Format Media',
        content: 'Wide format expertise',
        question: 'What\'s the key benefit of Solvit Sign & Display Media?',
        options: ['Food-safe certification', 'Eco-solvent and UV ink compatibility', 'Screen printing capability', 'Offset printing quality'],
        correctAnswer: 1,
        explanation: 'Solvit media is engineered for wide format printers using eco-solvent, UV, and latex inks.',
        difficulty: 'medium',
        tags: ['wide_format', 'signage'],
      },
      
      // Objection Practice
      {
        cardType: 'objection_practice',
        title: 'Price Objection',
        content: 'Handle the "too expensive" objection',
        question: 'Customer says: "Your prices are higher than my current supplier."',
        objectionType: 'price',
        suggestedResponses: [
          { id: 'value', text: 'I understand. Let me show you how our material quality reduces reprints and waste, which often saves more than the price difference.', isRecommended: true },
          { id: 'compare', text: 'What are you currently paying? I may be able to find a comparable product at a better price point.', isRecommended: true },
          { id: 'discount', text: 'Let me see what discount I can offer you.', isRecommended: false },
          { id: 'volume', text: 'We offer volume pricing tiers. If you can commit to larger orders, we can get closer to your target price.', isRecommended: true },
        ],
        difficulty: 'medium',
        tags: ['objection', 'price', 'negotiation'],
      },
      {
        cardType: 'objection_practice',
        title: 'MOQ Objection',
        content: 'Handle minimum order concerns',
        question: 'Customer says: "Your minimum order quantity is too high for my needs."',
        objectionType: 'moq',
        suggestedResponses: [
          { id: 'sample', text: 'Would you like a sample pack first? We can start small and scale up as your needs grow.', isRecommended: true },
          { id: 'mix', text: 'We can mix sizes within the same product line to help you reach the minimum while getting variety.', isRecommended: true },
          { id: 'split', text: 'Some customers split orders with other printers - would that work for you?', isRecommended: false },
          { id: 'stock', text: 'The MOQ helps us offer better pricing. The material stores well, so you\'ll have stock ready when orders come in.', isRecommended: true },
        ],
        difficulty: 'easy',
        tags: ['objection', 'moq', 'quantity'],
      },
      {
        cardType: 'objection_practice',
        title: 'Lead Time Objection',
        content: 'Handle delivery timing concerns',
        question: 'Customer says: "I need this faster than your lead time."',
        objectionType: 'lead_time',
        suggestedResponses: [
          { id: 'stock', text: 'Let me check what we have in stock - we may be able to ship popular items faster.', isRecommended: true },
          { id: 'rush', text: 'We do have rush options available for time-sensitive orders. Would that help?', isRecommended: true },
          { id: 'plan', text: 'For future orders, if you can plan 2-3 weeks ahead, we can ensure on-time delivery every time.', isRecommended: true },
          { id: 'partial', text: 'We could ship a partial order immediately and the rest when it\'s ready.', isRecommended: true },
        ],
        difficulty: 'medium',
        tags: ['objection', 'lead_time', 'delivery'],
      },
      
      // Competitor Intel
      {
        cardType: 'competitor_intel',
        title: 'Avery Dennison',
        content: 'Know your competition',
        question: 'How does 4S Graphics compare to Avery Dennison for label materials?',
        explanation: 'Our Graffiti line offers comparable quality at better pricing. Key differentiators: personalized service, flexible MOQs, and faster domestic shipping.',
        difficulty: 'medium',
        tags: ['competitor', 'avery'],
      },
      {
        cardType: 'competitor_intel',
        title: 'Nekoosa',
        content: 'Competitive positioning',
        question: 'What\'s our advantage over Nekoosa for synthetic labels?',
        explanation: 'Graffiti SOFT Poly offers better ink adhesion and layflat performance. We also provide technical support and press testing assistance.',
        difficulty: 'medium',
        tags: ['competitor', 'nekoosa'],
      },
      
      // Machine Profile Check
      {
        cardType: 'machine_profile_check',
        title: 'Confirm Customer Equipment',
        content: 'Quick machine profile verification',
        question: 'What printing equipment does this customer use?',
        explanation: 'Knowing their machines helps recommend the right products. Ask about: print technology, brand/model, ink type, and typical job sizes.',
        difficulty: 'easy',
        tags: ['discovery', 'equipment'],
      },
      
      // Customer Success Story
      {
        cardType: 'customer_story',
        title: 'Label Printer Success',
        content: 'A label printer in Ohio switched to Graffiti SOFT Poly after struggling with ink adhesion issues on their old supplier\'s material. Result: 40% fewer reprints and faster production speeds.',
        question: 'How can this success story help your next call?',
        explanation: 'Share relevant success stories to build credibility. Customers relate to peers facing similar challenges.',
        difficulty: 'easy',
        tags: ['success_story', 'labels'],
      },
      
      // Additional Product Quiz
      {
        cardType: 'product_quiz',
        title: 'DTF Film Knowledge',
        content: 'Direct-to-Film expertise',
        question: 'What is DTF (Direct-to-Film) printing primarily used for?',
        options: ['Large format signage', 'Garment decoration and apparel', 'Label production', 'Offset printing'],
        correctAnswer: 1,
        explanation: 'DTF printing is used to create transfers for t-shirts, hats, bags, and other textiles - a growing market segment.',
        difficulty: 'easy',
        tags: ['dtf', 'apparel', 'decoration'],
      },
      
      // Additional Competitor Intel
      {
        cardType: 'competitor_intel',
        title: 'General Formulations',
        content: 'Market positioning',
        question: 'How do we compete with General Formulations for wide format media?',
        explanation: 'Our Solvit line matches GF quality with more responsive customer service. We offer faster sample turnaround and technical support for press testing.',
        difficulty: 'medium',
        tags: ['competitor', 'wide_format'],
      },
    ];
    
    for (const card of microCards) {
      await db.insert(spotlightMicroCards).values(card as any).onConflictDoNothing();
    }
    console.log(`[Spotlight Coaching] Seeded ${microCards.length} micro-coaching cards`);
    
    const coachTips = [
      // Pre-call tips
      { tipType: 'pre_call', triggerContext: 'sales_call', content: 'Before calling, review the customer\'s machine profile to recommend products compatible with their equipment.' },
      { tipType: 'pre_call', triggerContext: 'sales_call', content: 'Check if they\'ve received samples recently - a great conversation starter!', machineTypeCode: 'hp_indigo' },
      { tipType: 'pre_call', triggerContext: 'sales_call', content: 'Wide format customers often need signage media - mention Solvit products.', machineTypeCode: 'wide_format' },
      
      // Post-task tips
      { tipType: 'post_task', triggerContext: 'hygiene_pricing_tier', content: 'Great job setting the pricing tier! This ensures accurate quotes going forward.' },
      { tipType: 'post_task', triggerContext: 'hygiene_sales_rep', content: 'Now that you\'ve claimed this customer, consider reaching out to introduce yourself.' },
      { tipType: 'post_task', triggerContext: 'sales_call', content: 'Remember to schedule a follow-up while the conversation is fresh.' },
      { tipType: 'post_task', triggerContext: 'enablement_swatchbook', content: 'Follow up in 1-2 weeks to see if they\'ve tested the samples.' },
      
      // Product suggestion tips
      { tipType: 'product_suggestion', triggerContext: 'digital_dry_toner', content: 'Graffiti Polyester Paper is perfect for digital dry toner presses - great for labels and packaging.', machineTypeCode: 'digital_dry_toner' },
      { tipType: 'product_suggestion', triggerContext: 'hp_indigo', content: 'HP Indigo users love our Graffiti line - specially coated for liquid electroink.', machineTypeCode: 'hp_indigo' },
      { tipType: 'product_suggestion', triggerContext: 'wide_format', content: 'Solvit Sign & Display Media works great with eco-solvent, UV, and latex inks.', machineTypeCode: 'wide_format' },
    ];
    
    for (const tip of coachTips) {
      await db.insert(spotlightCoachTips).values(tip as any).onConflictDoNothing();
    }
    console.log(`[Spotlight Coaching] Seeded ${coachTips.length} coach tips`);
    
    console.log('[Spotlight Coaching] Seeding complete');
  } catch (error) {
    console.error('[Spotlight Coaching] Error seeding content:', error);
  }
}
