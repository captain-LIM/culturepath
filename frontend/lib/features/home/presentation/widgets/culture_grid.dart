import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/culture_model.dart';
import '../../data/cultures_repository.dart';
import 'culture_card.dart';

final culturesProvider = FutureProvider<List<CultureCategory>>((ref) {
  return CulturesRepository().getCultures();
});

class CultureGrid extends ConsumerWidget {
  const CultureGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final culturesAsync = ref.watch(culturesProvider);

    return culturesAsync.when(
      loading: () => const SliverToBoxAdapter(
        child: SizedBox(height: 300, child: Center(child: CircularProgressIndicator())),
      ),
      error: (e, _) => SliverToBoxAdapter(
        child: SizedBox(
          height: 200,
          child: Center(child: Text('카테고리를 불러올 수 없습니다.\n$e', textAlign: TextAlign.center)),
        ),
      ),
      data: (cultures) => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: cultures.length > 10 ? 10 : cultures.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 5,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.82,
            ),
            itemBuilder: (context, index) => CultureCard(
              culture: cultures[index],
              onTap: () => context.push('/cultures/${cultures[index].id}', extra: cultures[index]),
            ),
          ),
        ),
      ),
    );
  }
}
