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
      data: (cultures) => SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        sliver: SliverGrid(
          delegate: SliverChildBuilderDelegate(
            (context, index) => CultureCard(
              culture: cultures[index],
              onTap: () => context.push('/cultures/${cultures[index].id}', extra: cultures[index]),
            ),
            childCount: cultures.length,
          ),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
            childAspectRatio: 1.05,
          ),
        ),
      ),
    );
  }
}
